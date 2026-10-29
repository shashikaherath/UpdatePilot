import { Request, Response, NextFunction } from 'express';
import { updateService } from './service.js';
import { ListUpdatesQuery } from './schemas.js';

export class UpdateController {
  async listUpdates(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await updateService.listUpdateCandidates(
        req.user!.id,
        req.query as unknown as ListUpdatesQuery
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async previewUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await updateService.createPreview(req.user!.id, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async executeUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string;
      const result = await updateService.executeUpdate(
        req.user!.id,
        req.params.id,
        idempotencyKey,
        req.body
      );
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const updateController = new UpdateController();
