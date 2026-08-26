import type { DocumentPickerAsset } from "expo-document-picker";

export async function readAssetBytes(
  asset: DocumentPickerAsset,
): Promise<Uint8Array> {
  if (asset.file) {
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  const response = await fetch(asset.uri);
  return new Uint8Array(await response.arrayBuffer());
}
