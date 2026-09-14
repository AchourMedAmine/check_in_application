import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/lib/types";
import { ApiError } from "@/lib/errors";

/**
 * Wrapper for API routes with error handling
 * Standardizes API responses across all endpoints
 */
export async function handleApiRequest<T>(
  handler: (req: NextRequest) => Promise<T>,
  req: NextRequest
) {
  try {
    const result = await handler(req);
    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<T>);
  } catch (error) {
    console.error("API Error:", error);

    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        } as ApiResponse<null>,
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}
