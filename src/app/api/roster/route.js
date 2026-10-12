import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/validation.js';
import { solve } from '@/lib/solver.js';
import { buildResponse } from '@/lib/responseBuilder.js';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    // request body is not JSON at all — a client-side mistake, HTTP 400
    return NextResponse.json({
      status: 'invalid_input',
      errors: ['Invalid JSON format']
    }, { status: 400 });
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return NextResponse.json({
      status: 'invalid_input',
      errors: validation.errors
    }, { status: 400 });
  }

  try {
    const solverResult = solve(body);
    const finalResponse = buildResponse(body, solverResult);

    return NextResponse.json(finalResponse, { status: 200 });
  } catch (error) {
    // The payload passed validation, so anything thrown here is a fault on our
    // side: report it as a server error (HTTP 500) instead of blaming the input,
    // and keep the JSON error shape the dashboard already understands.
    console.error('API Error:', error);
    return NextResponse.json({
      status: 'error',
      errors: ['Internal server processing error']
    }, { status: 500 });
  }
}
