import "server-only";
import mammoth from "mammoth";
import { getOpenAIClient } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { ResponseInputContent } from "openai/resources/responses/responses";

export interface ComplexBookingExtraction {
  customer: {
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
  };
  legs: Array<{
    journey_type: "one_way" | "return" | "disposal" | "multi_day";
    pickup_address: string;
    destination_address: string;
    pickup_date: string | null;
    pickup_time: string | null;
    return_date: string | null;
    return_time: string | null;
    passenger_count: number | null;
    luggage_count: number | null;
    vehicle_notes: string | null;
    special_requirements: string | null;
  }>;
  internal_notes: string | null;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    customer: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        company: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
      },
      required: ["name", "company", "email", "phone"],
      additionalProperties: false,
    },
    legs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          journey_type: { type: "string", enum: ["one_way", "return", "disposal", "multi_day"] },
          pickup_address: { type: "string" },
          destination_address: { type: "string" },
          pickup_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          pickup_time: { type: ["string", "null"], description: "24-hour HH:MM" },
          return_date: { type: ["string", "null"], description: "YYYY-MM-DD, only for a return journey" },
          return_time: { type: ["string", "null"], description: "24-hour HH:MM, only for a return journey" },
          passenger_count: { type: ["integer", "null"] },
          luggage_count: { type: ["integer", "null"] },
          vehicle_notes: { type: ["string", "null"], description: "Free-text vehicle hint, e.g. '45-seat coach' — do not invent one if not mentioned" },
          special_requirements: { type: ["string", "null"] },
        },
        required: [
          "journey_type",
          "pickup_address",
          "destination_address",
          "pickup_date",
          "pickup_time",
          "return_date",
          "return_time",
          "passenger_count",
          "luggage_count",
          "vehicle_notes",
          "special_requirements",
        ],
        additionalProperties: false,
      },
    },
    internal_notes: { type: ["string", "null"], description: "Anything relevant that didn't fit a leg or customer field" },
  },
  required: ["customer", "legs", "internal_notes"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You extract structured travel itinerary data for a transport/coach-hire CRM from a pasted message, email, or an " +
  "uploaded quote/itinerary document. The trip may span multiple days and multiple pickup/destination pairs — " +
  "create one entry in `legs` per distinct journey segment (e.g. Day 1 airport transfer, Day 2 city tour, Day 3 " +
  "return transfer are three separate legs), in chronological order. Only extract information that is actually " +
  "present — never invent dates, times, passenger counts, or vehicle types that aren't stated. Use null for " +
  "anything not mentioned.";

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function downloadFileBuffer(storagePath: string): Promise<Buffer> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").download(storagePath);
  if (error || !data) throw new Error(error?.message ?? "Could not read the uploaded file.");
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractComplexBooking(input: {
  pastedText: string | null;
  file: { storagePath: string; mimeType: string; fileName: string } | null;
}): Promise<ComplexBookingExtraction> {
  if (!input.pastedText && !input.file) {
    throw new Error("Paste itinerary text or upload a file first.");
  }

  const content: ResponseInputContent[] = [];
  if (input.pastedText) {
    content.push({ type: "input_text", text: input.pastedText });
  }

  if (input.file) {
    const { mimeType, fileName, storagePath } = input.file;
    if (mimeType.startsWith("image/")) {
      const buffer = await downloadFileBuffer(storagePath);
      content.push({ type: "input_image", detail: "auto", image_url: bufferToDataUrl(buffer, mimeType) });
    } else if (mimeType === "application/pdf") {
      const buffer = await downloadFileBuffer(storagePath);
      content.push({ type: "input_file", filename: fileName, file_data: bufferToDataUrl(buffer, mimeType) });
    } else if (mimeType === DOCX_MIME || fileName.toLowerCase().endsWith(".docx")) {
      const buffer = await downloadFileBuffer(storagePath);
      const { value: text } = await mammoth.extractRawText({ buffer });
      if (!text.trim()) throw new Error("Could not read any text from this Word document.");
      content.push({ type: "input_text", text });
    } else {
      throw new Error("Unsupported file type — upload a PDF, Word (.docx) document, or an image, or paste the itinerary text instead.");
    }
  }

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: "gpt-4o",
    instructions: SYSTEM_PROMPT,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "complex_booking_extraction",
        strict: true,
        schema: EXTRACTION_SCHEMA,
      },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error("The AI didn't return any extracted data — try again or enter this booking manually.");

  return JSON.parse(raw) as ComplexBookingExtraction;
}
