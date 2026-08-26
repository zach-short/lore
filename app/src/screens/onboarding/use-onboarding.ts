import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRef, useState } from "react";

import { useAuth } from "@/lib/auth";
import { useLoreData } from "@/lib/data";
import { readAssetBytes } from "@/lib/files";
import { ExportParseError, parseExportZip } from "@/lib/letterboxd";
import { queryKeys } from "@/lib/data/query-keys";
import { supabase } from "@/lib/supabase";
import { STRINGS } from "@/lib/strings";

import type { ParsedExport } from "@/lib/letterboxd";

/* Windows browsers report zips with the second type; octet-stream covers
   pickers that don't sniff at all — the parser rejects non-zips regardless. */
const ZIP_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

export function useOnboarding() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const dataQuery = useLoreData();

  const bytesRef = useRef<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [username, setUsername] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handlePickExport = async () => {
    setParseError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ZIP_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setIsParsing(true);
    try {
      const bytes = await readAssetBytes(asset);
      const nextParsed = parseExportZip(bytes, asset.name);
      bytesRef.current = bytes;
      setFileName(asset.name);
      setParsed(nextParsed);
      setUsername(nextParsed.summary.username ?? "");
    } catch (e) {
      bytesRef.current = null;
      setFileName(null);
      setParsed(null);
      setParseError(
        e instanceof ExportParseError
          ? e.message
          : "Couldn’t read that file — pick the zip Letterboxd emailed you.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const upload = useMutation({
    mutationFn: async () => {
      const userId = session?.user.id;
      const bytes = bytesRef.current;
      if (!userId || !bytes || !parsed || !fileName) {
        throw new Error("Pick your export zip first.");
      }
      const cleanUsername = username.trim();
      if (!cleanUsername) {
        throw new Error(STRINGS.onboarding.usernameMissing);
      }
      const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
      const objectPath = `${userId}/${Date.now()}-${safeName}`;
      const { error: storageError } = await supabase.storage
        .from("exports")
        .upload(objectPath, toArrayBuffer(bytes), {
          contentType: "application/zip",
        });
      if (storageError) throw new Error(storageError.message);

      const { error: uploadRowError } = await supabase.from("uploads").insert({
        user_id: userId,
        object_path: objectPath,
        file_name: safeName,
        size_bytes: bytes.byteLength,
        stats: parsed.summary,
      });
      if (uploadRowError) throw new Error(uploadRowError.message);

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        letterboxd_username: cleanUsername,
        display_name: parsed.summary.displayName,
        onboarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (profileError) throw new Error(profileError.message);
      return userId;
    },
    onSuccess: (userId) => {
      /* the root layout's guard flips once the profile query sees onboarded_at */
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile(userId) });
    },
  });

  const handleSignOut = () => {
    supabase.auth.signOut().catch(() => {
      /* a failed sign-out leaves the session; nothing useful to do here */
    });
  };

  /* Soft check against the crew the pipeline already knows; data.json is the
     only member list the app has, and it being stale is not a reason to block. */
  const knownUsernames = (dataQuery.data?.members ?? []).map((m) => m.username);
  const isUnknownUsername =
    username.trim().length > 0 &&
    knownUsernames.length > 0 &&
    !knownUsernames.some(
      (u) => u.toLowerCase() === username.trim().toLowerCase(),
    );

  return {
    fileName,
    parsed,
    username,
    setUsername,
    isParsing,
    parseError,
    isUploading: upload.isPending,
    uploadError: upload.error instanceof Error ? upload.error.message : null,
    handlePickExport,
    handleUpload: () => upload.mutate(),
    handleSignOut,
    knownUsernames,
    isUnknownUsername,
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.slice().buffer as ArrayBuffer;
}
