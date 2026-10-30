import { serveOperation } from '../_shared/handler.ts';
import { generateCardOp } from '../_shared/operations.ts';

Deno.serve(serveOperation(generateCardOp));
