import { SetMetadata } from '@nestjs/common';

export interface FastifyRouteSchema {
  body?: Record<string, any>;
  params?: Record<string, any>;
  querystring?: Record<string, any>;
  response?: Record<number | string, Record<string, any>>;
}

export const FASTIFY_SCHEMA_KEY = 'fastify:route:schema';
export const FastifySchema = (schema: FastifyRouteSchema) => SetMetadata(FASTIFY_SCHEMA_KEY, schema);
