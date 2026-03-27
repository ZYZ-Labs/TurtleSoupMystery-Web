declare namespace Express {
  interface Request {
    auth?: {
      username: string;
      expiresAt: string;
    };
  }
}
