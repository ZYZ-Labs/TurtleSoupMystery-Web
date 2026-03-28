import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AuthService } from './services/authService.js';
import { OllamaService } from './services/ollamaService.js';
import { RoomService, ServiceError } from './services/roomService.js';
import { StateStore } from './storage/stateStore.js';

const roomCreateSchema = z.object({
  displayName: z.string().trim().min(1, '请输入你的显示名称。').max(24, '显示名称请控制在 24 个字符内。'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  generationPrompt: z.string().trim().max(200, '生成提示请控制在 200 个字符内。').default(''),
  clientId: z.string().trim().max(64).optional().default('')
});

const roomJoinSchema = z.object({
  roomCode: z.string().trim().min(4, '请输入房间码。').max(12, '房间码格式不正确。'),
  displayName: z.string().trim().min(1, '请输入你的显示名称。').max(24, '显示名称请控制在 24 个字符内。'),
  clientId: z.string().trim().max(64).optional().default('')
});

const roomRestartSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  generationPrompt: z.string().trim().max(200, '生成提示请控制在 200 个字符内。').default('')
});

const roomQuestionSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。'),
  question: z.string().trim().min(1, '问题不能为空。').max(280, '单次提问请控制在 280 个字符内。')
});

const finalGuessSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。'),
  guess: z.string().trim().min(1, '最终猜测不能为空。').max(2000, '最终猜测请控制在 2000 个字符内。')
});

const participantActionSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。')
});

const checkSchema = z.object({
  baseUrl: z.string().trim().min(1, 'Ollama 地址不能为空。'),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000)
});

const supplierSchema = z.object({
  label: z.string().trim().min(1, '请先填写供应商名称。').max(32, '供应商名称请控制在 32 个字符内。'),
  provider: z.enum(['ollama']).default('ollama'),
  baseUrl: z.string().trim().min(1, 'Ollama 地址不能为空。'),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000)
});

const runtimeConfigSchema = z.object({
  generationTimeoutMs: z.number().int().min(30000).max(21600000).default(3600000),
  generationSupplierId: z.string().trim().default(''),
  generationModelCategory: z.enum(['all', 'balanced', 'reasoning', 'lightweight', 'multimodal', 'other']).default('all'),
  generationModel: z.string().trim().default(''),
  validationSupplierId: z.string().trim().default(''),
  validationModelCategory: z.enum(['all', 'balanced', 'reasoning', 'lightweight', 'multimodal', 'other']).default('all'),
  validationModel: z.string().trim().default('')
});

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名。'),
  password: z.string().trim().min(1, '请输入密码。')
});

export async function createApp() {
  const store = new StateStore();
  await store.ensureInitialized();
  const roomService = new RoomService(store, new OllamaService());
  const authService = new AuthService();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  type AsyncHandler = (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ) => Promise<void> | void;

  const wrap =
    (handler: AsyncHandler): express.RequestHandler =>
    (request, response, next) =>
      Promise.resolve(handler(request, response, next)).catch(next);

  function getBearerToken(request: express.Request) {
    const header = request.header('authorization')?.trim() ?? '';

    if (!header.toLowerCase().startsWith('bearer ')) {
      return '';
    }

    return header.slice(7).trim();
  }

  const requireAuth: express.RequestHandler = (request, response, next) => {
    const token = getBearerToken(request);
    const session = authService.verify(token);

    if (!session) {
      response.status(401).json({ message: '请先登录。' });
      return;
    }

    request.auth = session;
    next();
  };

  app.get(
    '/api/health',
    wrap(async (_request, response) => {
      response.json({
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    })
  );

  app.post(
    '/api/auth/login',
    wrap(async (request, response) => {
      const body = loginSchema.parse(request.body ?? {});
      const session = authService.login(body.username, body.password);

      if (!session) {
        response.status(401).json({ message: '用户名或密码错误。' });
        return;
      }

      response.json(session);
    })
  );

  app.get(
    '/api/auth/session',
    wrap(async (request, response) => {
      const session = authService.verify(getBearerToken(request));
      response.json({
        authenticated: Boolean(session),
        session
      });
    })
  );

  app.post(
    '/api/auth/logout',
    wrap(async (request, response) => {
      const token = getBearerToken(request);

      if (token) {
        authService.logout(token);
      }

      response.status(204).send();
    })
  );

  app.get(
    '/api/overview',
    wrap(async (_request, response) => {
      response.json(await roomService.getOverview());
    })
  );

  app.get(
    '/api/puzzles',
    wrap(async (_request, response) => {
      response.json(await roomService.listPuzzles());
    })
  );

  app.get(
    '/api/rooms',
    requireAuth,
    wrap(async (_request, response) => {
      response.json(await roomService.listRooms());
    })
  );

  app.delete(
    '/api/rooms/:roomId',
    requireAuth,
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      await roomService.deleteRoom(roomId);
      response.status(204).send();
    })
  );

  app.post(
    '/api/rooms',
    wrap(async (request, response) => {
      const body = roomCreateSchema.parse(request.body ?? {});
      response.status(201).json(await roomService.createRoom(body));
    })
  );

  app.post(
    '/api/rooms/join',
    wrap(async (request, response) => {
      const body = roomJoinSchema.parse(request.body ?? {});
      response.json(await roomService.joinRoom(body));
    })
  );

  app.get(
    '/api/rooms/code/:roomCode',
    wrap(async (request, response) => {
      const roomCode = Array.isArray(request.params.roomCode) ? request.params.roomCode[0] : request.params.roomCode;
      const room = await roomService.getRoomByCode(roomCode);

      if (!room) {
        response.status(404).json({ message: '房间不存在。' });
        return;
      }

      response.json(room);
    })
  );

  app.post(
    '/api/rooms/:roomId/questions',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = roomQuestionSchema.parse(request.body ?? {});
      response.json(await roomService.askQuestion(roomId, body.participantId, body.question));
    })
  );

  app.post(
    '/api/rooms/:roomId/final-guess',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = finalGuessSchema.parse(request.body ?? {});
      response.json(await roomService.submitFinalGuess(roomId, body.participantId, body.guess));
    })
  );

  app.post(
    '/api/rooms/:roomId/hints/request',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = participantActionSchema.parse(request.body ?? {});
      response.json(await roomService.requestHint(roomId, body.participantId));
    })
  );

  app.post(
    '/api/rooms/:roomId/hints/approve',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = participantActionSchema.parse(request.body ?? {});
      response.json(await roomService.approveHint(roomId, body.participantId));
    })
  );

  app.post(
    '/api/rooms/:roomId/reveal',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = participantActionSchema.parse(request.body ?? {});
      response.json(await roomService.revealRoom(roomId, body.participantId));
    })
  );

  app.post(
    '/api/rooms/:roomId/restart',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = roomRestartSchema.parse(request.body ?? {});
      response.json(
        await roomService.restartRoom(roomId, body.participantId, {
          difficulty: body.difficulty,
          generationPrompt: body.generationPrompt
        })
      );
    })
  );

  app.post(
    '/api/rooms/:roomId/heartbeat',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = participantActionSchema.parse(request.body ?? {});
      response.json(await roomService.heartbeatRoom(roomId, body.participantId));
    })
  );

  app.get(
    '/api/settings/ollama',
    requireAuth,
    wrap(async (_request, response) => {
      response.json(await roomService.getOllamaConfig());
    })
  );

  app.post(
    '/api/settings/ollama/check',
    requireAuth,
    wrap(async (request, response) => {
      const body = checkSchema.parse(request.body ?? {});
      response.json(await roomService.checkOllamaConnection(body.baseUrl, body.timeoutMs));
    })
  );

  app.post(
    '/api/settings/ollama/suppliers',
    requireAuth,
    wrap(async (request, response) => {
      const body = supplierSchema.parse(request.body ?? {});
      response.status(201).json(await roomService.createOllamaSupplier(body));
    })
  );

  app.put(
    '/api/settings/ollama/suppliers/:supplierId',
    requireAuth,
    wrap(async (request, response) => {
      const supplierId = Array.isArray(request.params.supplierId) ? request.params.supplierId[0] : request.params.supplierId;
      const body = supplierSchema.parse(request.body ?? {});
      response.json(await roomService.updateOllamaSupplier(supplierId, body));
    })
  );

  app.post(
    '/api/settings/ollama/suppliers/:supplierId/check',
    requireAuth,
    wrap(async (request, response) => {
      const supplierId = Array.isArray(request.params.supplierId) ? request.params.supplierId[0] : request.params.supplierId;
      response.json(await roomService.refreshOllamaSupplierModels(supplierId));
    })
  );

  app.delete(
    '/api/settings/ollama/suppliers/:supplierId',
    requireAuth,
    wrap(async (request, response) => {
      const supplierId = Array.isArray(request.params.supplierId) ? request.params.supplierId[0] : request.params.supplierId;
      response.json(await roomService.deleteOllamaSupplier(supplierId));
    })
  );

  app.put(
    '/api/settings/ollama/runtime',
    requireAuth,
    wrap(async (request, response) => {
      const body = runtimeConfigSchema.parse(request.body ?? {});
      response.json(await roomService.saveOllamaRuntimeConfig(body));
    })
  );

  const publicDir = resolve(process.cwd(), 'public');

  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(
      /^(?!\/api).*/,
      wrap(async (_request, response) => {
        response.sendFile(resolve(publicDir, 'index.html'));
      })
    );
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: error.issues[0]?.message ?? '请求参数不合法。'
      });
      return;
    }

    if (error instanceof ServiceError) {
      response.status(error.statusCode).json({ message: error.message });
      return;
    }

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? ((error as { statusCode: number }).statusCode ?? 500)
        : 500;
    const message = error instanceof Error ? error.message : '服务器内部错误。';
    response.status(statusCode).json({ message });
  });

  return {
    app,
    roomService
  };
}
