import { Request, Response, NextFunction } from 'express';
import { scanService } from './service.js';

export class ScanController {
  async startScan(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await scanService.startScan(req.user!.id, req.params.id, req.body);
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getScan(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await scanService.getScan(req.user!.id, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const scanController = new ScanController();
