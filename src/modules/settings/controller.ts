import { Request, Response, NextFunction } from 'express';
import { settingsService } from './service.js';

export class SettingsController {
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await settingsService.getSettings(req.user!.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await settingsService.updateSettings(req.user!.id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
