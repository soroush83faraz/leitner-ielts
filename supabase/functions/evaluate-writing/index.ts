import { serveOperation } from '../_shared/handler.ts';
import { evaluateOp } from '../_shared/operations.ts';

Deno.serve(serveOperation(evaluateOp));
