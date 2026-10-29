import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export interface RequestValidationSchema {
  params?: AnyZodObject;
  query?: AnyZodObject;
  body?: AnyZodObject;
}

export function validate(schema: RequestValidationSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
      } else {
        next(error);
      }
    }
  };
}
