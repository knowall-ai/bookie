import { bookieConfigured, respondJson, type ResponseItem } from '@/lib/bookie/llm';
import {
  EXTRACTION_INSTRUCTIONS,
  EXTRACTION_JSON_SCHEMA,
  parseExtraction,
  reviewExtraction,
  type ReviewedExtraction,
} from './extraction';

export interface DocumentFile {
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export type ModelCall = (
  instructions: string,
  input: ResponseItem[],
  schema: { name: string; schema: Record<string, unknown> }
) => Promise<string>;

/** The model input for one document: a PDF as a file, an image as an image. */
export function documentInput(file: DocumentFile): ResponseItem[] {
  const base64 = Buffer.from(file.bytes).toString('base64');
  const part: ResponseItem =
    file.contentType === 'application/pdf'
      ? {
          type: 'input_file',
          filename: file.fileName,
          file_data: `data:application/pdf;base64,${base64}`,
        }
      : { type: 'input_image', image_url: `data:${file.contentType};base64,${base64}` };
  return [
    {
      role: 'user',
      content: [{ type: 'input_text', text: `The attached file is "${file.fileName}".` }, part],
    },
  ];
}

/**
 * Read one emailed document with the portal's Azure OpenAI deployment. Only the
 * attachment itself is sent (never anything from Xero or Business Central), and
 * Azure OpenAI neither keeps nor trains on it.
 */
export async function extractDocument(
  file: DocumentFile,
  call: ModelCall = respondJson
): Promise<ReviewedExtraction> {
  const text = await call(EXTRACTION_INSTRUCTIONS, documentInput(file), {
    name: 'emailed_document',
    schema: EXTRACTION_JSON_SCHEMA,
  });
  return reviewExtraction(parseExtraction(text));
}

export function extractionConfigured(): boolean {
  return bookieConfigured();
}
