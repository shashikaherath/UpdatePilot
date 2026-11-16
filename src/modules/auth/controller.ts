import { Request, Response, NextFunction } from 'express';
import { authService } from './service.js';
import { config } from '../../config/index.js';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      const cookieSameSite = config.isProduction ? 'none' : 'lax';
      res.cookie(config.SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: cookieSameSite,
        maxAge: config.SESSION_MAX_AGE_MS,
      });

      res.status(201).json({
        user: result.user,
        sessionToken: result.sessionToken,
        message: 'Account registered successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      const cookieSameSite = config.isProduction ? 'none' : 'lax';
      res.cookie(config.SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: cookieSameSite,
        maxAge: config.SESSION_MAX_AGE_MS,
      });

      res.status(200).json({
        user: result.user,
        sessionToken: result.sessionToken,
        message: 'Logged in successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.sessionId) {
        await authService.logout(req.sessionId, req.user?.id);
      }
      res.clearCookie(config.SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.isProduction ? 'none' : 'lax',
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
