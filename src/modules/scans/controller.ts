import { Request, Response, NextFunction } from 'express';
import { scanService } from './service.js';

export class ScanController {
  async startScan(req: Request, res: Response, next: NextFunction) {
    try {
      const correlationId = req.headers['x-correlation-id'] || 'none';
      console.log(`[SCAN_REQUEST] user=${req.user!.id} deviceId=${req.params.id} correlationId=${correlationId}`);
      const result = await scanService.startScan(req.user!.id, req.params.id, req.body);
      console.log(`[SCAN_CREATED] jobId=${result.jobId} scanId=${result.scanId} state=${result.state}`);
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
