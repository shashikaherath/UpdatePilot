import { Request, Response, NextFunction } from 'express';
import { securityService } from './service.js';

export class SecurityController {
  async getFindings(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await securityService.getVerifiedFindings(req.user!.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const securityController = new SecurityController();
