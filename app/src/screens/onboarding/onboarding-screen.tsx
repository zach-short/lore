import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, useColorScheme } from "react-native";

import { ScreenShell } from "@/components/screen-shell";
import { SectionLabel } from "@/components/section-label";
import { STRINGS } from "@/lib/strings";
import { paletteFor } from "@/theme";
import { Pressable, ScrollView, Text, TextInput, View } from "@/tw";

import { ReelSummary } from "./reel-summary";
import { useOnboarding } from "./use-onboarding";

const LETTERBOXD_DATA_URL = "https://letterboxd.com/settings/data/";

export function OnboardingScreen() {
  const scheme = useColorScheme();
  const {
    fileName,
    parsed,
    username,
    setUsername,
    isParsing,
    parseError,
    isUploading,
    uploadError,
    handlePickExport,
    handleUpload,
    handleSignOut,
    isUnknownUsername,
  } = useOnboarding();

  return (
    <ScreenShell>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-16 pt-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <SectionLabel>{STRINGS.onboarding.eyebrow}</SectionLabel>
          <Text className="font-display text-5xl leading-[52px] text-ink">
            {STRINGS.onboarding.title.toUpperCase()}
            <Text className="text-lamp">.</Text>
          </Text>
          <Text className="text-base leading-5 text-muted">
            {STRINGS.onboarding.intro}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm leading-5 text-muted">
            {STRINGS.onboarding.exportHow}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STRINGS.onboarding.openLetterboxd}
            onPress={() => WebBrowser.openBrowserAsync(LETTERBOXD_DATA_URL)}
            className="items-center rounded-full border border-line bg-surface px-5 py-3 active:opacity-80"
          >
            <Text className="font-semibold text-ink">
              {STRINGS.onboarding.openLetterboxd}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STRINGS.onboarding.pickZip}
            onPress={handlePickExport}
            disabled={isParsing || isUploading}
            className={`items-center rounded-full px-5 py-3 active:opacity-80 disabled:opacity-50 ${
              parsed ? "border border-line bg-surface" : "bg-lamp"
            }`}
          >
            <Text
              className={`font-semibold ${parsed ? "text-ink" : "text-on-lamp"}`}
            >
              {parsed ? STRINGS.onboarding.pickAnother : STRINGS.onboarding.pickZip}
            </Text>
          </Pressable>
          {isParsing ? (
            <View className="flex-row items-center justify-center gap-2 py-2">
              <ActivityIndicator color={paletteFor(scheme).lamp} />
              <Text className="text-sm text-muted">
                {STRINGS.onboarding.parsing}
              </Text>
            </View>
          ) : null}
          {parseError ? (
            <Text className="text-sm text-bad">{parseError}</Text>
          ) : null}
        </View>

        {parsed ? (
          <View className="gap-3">
            {fileName ? (
              <Text className="text-xs text-faint">{fileName}</Text>
            ) : null}
            <ReelSummary summary={parsed.summary} />

            <View className="gap-1">
              <SectionLabel>{STRINGS.onboarding.usernameLabel}</SectionLabel>
              <TextInput
                className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={STRINGS.onboarding.usernamePlaceholder}
                value={username}
                onChangeText={setUsername}
                editable={!isUploading}
              />
              {!username.trim() ? (
                <Text className="text-xs leading-4 text-muted">
                  {STRINGS.onboarding.usernameMissing}
                </Text>
              ) : null}
              {isUnknownUsername ? (
                <Text className="text-xs leading-4 text-muted">
                  {STRINGS.onboarding.usernameUnknown}
                </Text>
              ) : null}
            </View>

            {uploadError ? (
              <Text className="text-sm text-bad">{uploadError}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STRINGS.onboarding.upload}
              onPress={handleUpload}
              disabled={isUploading || !username.trim()}
              className="items-center rounded-full bg-lamp px-5 py-3 active:opacity-80 disabled:opacity-50"
            >
              <Text className="font-semibold text-on-lamp">
                {isUploading
                  ? STRINGS.onboarding.uploading
                  : STRINGS.onboarding.upload}
              </Text>
            </Pressable>
            <Text className="text-xs leading-4 text-faint">
              {STRINGS.onboarding.note}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STRINGS.onboarding.signOut}
          onPress={handleSignOut}
          className="items-center px-5 py-2 active:opacity-80"
        >
          <Text className="text-sm text-muted">{STRINGS.onboarding.signOut}</Text>
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}
