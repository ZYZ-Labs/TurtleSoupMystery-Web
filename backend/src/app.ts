import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { OllamaService } from './services/ollamaService.js';
import { SessionService } from './services/sessionService.js';
import { StateStore } from './storage/stateStore.js';

const questionBodySchema = z.object({
  question: z.string().trim().min(1, '问题不能为空。')
});

const finalGuessSchema = z.object({
  guess: z.string().trim().min(1, '最终猜测不能为空。')
});

const sessionCreateSchema = z.object({
  puzzleId: z.string().trim().optional()
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
  const sessionService = new SessionService(store, new OllamaService());

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
      response.json(await sessionService.getOverview());
    })
  );

  app.get(
    '/api/puzzles',
    wrap(async (_request, response) => {
      response.json(await sessionService.listPuzzles());
    })
  );

  app.get(
    '/api/sessions',
    wrap(async (_request, response) => {
      response.json(await sessionService.listSessions());
    })
  );

  app.post(
    '/api/sessions',
    wrap(async (request, response) => {
      const body = sessionCreateSchema.parse(request.body ?? {});
      response.status(201).json(await sessionService.createSession(body.puzzleId));
    })
  );

  app.get(
    '/api/sessions/:sessionId',
    wrap(async (request, response) => {
      const sessionId = Array.isArray(request.params.sessionId)
        ? request.params.sessionId[0]
        : request.params.sessionId;
      const session = await sessionService.getSession(sessionId);

      if (!session) {
        response.status(404).json({ message: '对局不存在。' });
        return;
      }

      response.json(session);
    })
  );

  app.post(
    '/api/sessions/:sessionId/questions',
    wrap(async (request, response) => {
      const sessionId = Array.isArray(request.params.sessionId)
        ? request.params.sessionId[0]
        : request.params.sessionId;
      const body = questionBodySchema.parse(request.body ?? {});
      response.json(await sessionService.askQuestion(sessionId, body.question));
    })
  );

  app.post(
    '/api/sessions/:sessionId/final-guess',
    wrap(async (request, response) => {
      const sessionId = Array.isArray(request.params.sessionId)
        ? request.params.sessionId[0]
        : request.params.sessionId;
      const body = finalGuessSchema.parse(request.body ?? {});
      response.json(await sessionService.submitFinalGuess(sessionId, body.guess));
    })
  );

  app.post(
    '/api/sessions/:sessionId/reveal',
    wrap(async (request, response) => {
      const sessionId = Array.isArray(request.params.sessionId)
        ? request.params.sessionId[0]
        : request.params.sessionId;
      response.json(await sessionService.revealSession(sessionId));
    })
  );

  app.get(
    '/api/settings/ollama',
    wrap(async (_request, response) => {
      response.json(await sessionService.getOllamaConfig());
    })
  );

  app.post(
    '/api/settings/ollama/check',
    wrap(async (request, response) => {
      const body = checkSchema.parse(request.body ?? {});
      response.json(await sessionService.checkOllamaConnection(body.baseUrl, body.timeoutMs));
    })
  );

  app.put(
    '/api/settings/ollama',
    wrap(async (request, response) => {
      const body = saveConfigSchema.parse(request.body ?? {});
      response.json(await sessionService.saveOllamaConfig(body));
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

    const message = error instanceof Error ? error.message : '服务器内部错误。';
    response.status(500).json({ message });
  });

  return app;
}
