import { File } from "expo-file-system";

import type { DocumentPickerAsset } from "expo-document-picker";

/** Picked-document bytes on native; the .web sibling uses the DOM File API. */
export async function readAssetBytes(
  asset: DocumentPickerAsset,
): Promise<Uint8Array> {
  return await new File(asset.uri).bytes();
}
