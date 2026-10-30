import { serveOperation } from '../_shared/handler.ts';
import { practiceOp } from '../_shared/operations.ts';

Deno.serve(serveOperation(practiceOp));
