/* Image imports (Metro resolves them to an opaque asset id). Neither
   expo/types nor react-native ships a declaration for these, so images get
   one here alongside the CSS shim. */
declare module "*.png" {
  const asset: number;
  export default asset;
}
