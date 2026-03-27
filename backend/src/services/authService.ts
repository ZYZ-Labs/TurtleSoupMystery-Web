import { randomBytes, timingSafeEqual } from 'node:crypto';

export class AuthService {
  private readonly sessions = new Map<string, { username: string; expiresAt: number }>();
  private readonly sessionTtlMs = 12 * 60 * 60 * 1000;
  private readonly username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  private readonly password = process.env.ADMIN_PASSWORD?.trim() || 'admin123456';

  login(username: string, password: string) {
    if (!this.isValidCredential(username, this.username) || !this.isValidCredential(password, this.password)) {
      return null;
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = Date.now() + this.sessionTtlMs;
    this.sessions.set(token, { username: this.username, expiresAt });

    return {
      token,
      username: this.username,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  logout(token: string) {
    this.sessions.delete(token);
  }

  verify(token: string) {
    const session = this.sessions.get(token);

    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return {
      username: session.username,
      expiresAt: new Date(session.expiresAt).toISOString()
    };
  }

  private isValidCredential(input: string, expected: string) {
    const inputBuffer = Buffer.from(input);
    const expectedBuffer = Buffer.from(expected);

    if (inputBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(inputBuffer, expectedBuffer);
  }
}
