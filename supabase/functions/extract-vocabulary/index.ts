import { serveOperation } from '../_shared/handler.ts';
import { extractOp } from '../_shared/operations.ts';

Deno.serve(serveOperation(extractOp));
