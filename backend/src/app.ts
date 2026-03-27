import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { OllamaService } from './services/ollamaService.js';
import { RoomService, ServiceError } from './services/roomService.js';
import { StateStore } from './storage/stateStore.js';

const roomCreateSchema = z.object({
  displayName: z.string().trim().min(1, '请输入你的显示名称。').max(24, '显示名称最多 24 个字符。'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  generationPrompt: z.string().trim().min(2, '请描述想生成的汤底主题。').max(200, '生成提示请控制在 200 字以内。')
});

const roomJoinSchema = z.object({
  roomCode: z.string().trim().min(4, '请输入房间码。').max(12, '房间码格式不正确。'),
  displayName: z.string().trim().min(1, '请输入你的显示名称。').max(24, '显示名称最多 24 个字符。')
});

const roomQuestionSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。'),
  question: z.string().trim().min(1, '问题不能为空。').max(280, '单次提问请控制在 280 字以内。')
});

const finalGuessSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。'),
  guess: z.string().trim().min(1, '最终猜测不能为空。').max(2000, '最终猜测请控制在 2000 字以内。')
});

const participantActionSchema = z.object({
  participantId: z.string().trim().min(1, '缺少成员标识，请重新加入房间。')
});

const checkSchema = z.object({
  baseUrl: z.string().trim().min(1, 'Ollama 地址不能为空。'),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000)
});

const saveConfigSchema = z.object({
  baseUrl: z.string().trim().min(1, 'Ollama 地址不能为空。'),
  defaultModel: z.string().trim().default(''),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000)
});

export async function createApp() {
  const store = new StateStore();
  await store.ensureInitialized();
  const roomService = new RoomService(store, new OllamaService());

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

  app.get(
    '/api/health',
    wrap(async (_request, response) => {
      response.json({
        status: 'ok',
        timestamp: new Date().toISOString()
      });
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
    wrap(async (_request, response) => {
      response.json(await roomService.listRooms());
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
    '/api/rooms/:roomId/reveal',
    wrap(async (request, response) => {
      const roomId = Array.isArray(request.params.roomId) ? request.params.roomId[0] : request.params.roomId;
      const body = participantActionSchema.parse(request.body ?? {});
      response.json(await roomService.revealRoom(roomId, body.participantId));
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
    wrap(async (_request, response) => {
      response.json(await roomService.getOllamaConfig());
    })
  );

  app.post(
    '/api/settings/ollama/check',
    wrap(async (request, response) => {
      const body = checkSchema.parse(request.body ?? {});
      response.json(await roomService.checkOllamaConnection(body.baseUrl, body.timeoutMs));
    })
  );

  app.put(
    '/api/settings/ollama',
    wrap(async (request, response) => {
      const body = saveConfigSchema.parse(request.body ?? {});
      response.json(await roomService.saveOllamaConfig(body));
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

  return app;
}
