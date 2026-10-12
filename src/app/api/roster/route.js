import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/validation.js';
import { solve } from '@/lib/solver.js';
import { buildResponse } from '@/lib/responseBuilder.js';

export async function POST(req) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (err) {
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

    const solverResult = solve(body);
    const finalResponse = buildResponse(body, solverResult);
    
    return NextResponse.json(finalResponse, { status: 200 });
  } catch (error) {
    console.error("API Error:", error);
    // Even on server failure, return invalid_input or generic error gracefully
    return NextResponse.json({
      status: 'invalid_input',
      errors: ['Internal server processing error']
    }, { status: 400 });
  }
}