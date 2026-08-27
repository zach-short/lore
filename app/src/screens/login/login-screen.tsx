import { KeyboardAvoidingView, Platform } from "react-native";

import { LogoMark } from "@/components/logo-mark";
import { ScreenShell } from "@/components/screen-shell";
import { SectionLabel } from "@/components/section-label";
import { isSupabaseConfigured } from "@/lib/supabase";
import { STRINGS } from "@/lib/strings";
import { Pressable, ScrollView, Text, TextInput, View } from "@/tw";

import { useLogin } from "./use-login";

export function LoginScreen() {
  return (
    <ScreenShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pb-16 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 pt-2">
            <LogoMark className="h-16 w-16" />
            <View className="gap-1">
              <SectionLabel>{STRINGS.login.eyebrow}</SectionLabel>
              <Text className="font-display text-5xl leading-[52px] text-ink">
                {STRINGS.login.title.toUpperCase()}
                <Text className="text-lamp">.</Text>
              </Text>
              <Text className="text-base leading-5 text-muted">
                {STRINGS.login.intro}
              </Text>
            </View>
          </View>
          {isSupabaseConfigured ? (
            <LoginForm />
          ) : (
            <Text className="text-sm leading-5 text-bad">
              {STRINGS.authUnconfigured}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function LoginForm() {
  const {
    mode,
    email,
    setEmail,
    password,
    setPassword,
    error,
    notice,
    isBusy,
    handleSubmit,
    handleToggleMode,
  } = useLogin();

  return (
    <View className="gap-3">
      <View className="gap-1">
        <SectionLabel>{STRINGS.login.emailLabel}</SectionLabel>
        <TextInput
          className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink"
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          placeholder={STRINGS.login.emailPlaceholder}
          value={email}
          onChangeText={setEmail}
          editable={!isBusy}
        />
      </View>
      <View className="gap-1">
        <SectionLabel>{STRINGS.login.passwordLabel}</SectionLabel>
        <TextInput
          className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink"
          autoCapitalize="none"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          secureTextEntry
          placeholder={STRINGS.login.passwordPlaceholder}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
          editable={!isBusy}
        />
      </View>

      {error ? <Text className="text-sm text-bad">{error}</Text> : null}
      {notice ? <Text className="text-sm text-good">{notice}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          mode === "sign-in" ? STRINGS.login.signIn : STRINGS.login.createAccount
        }
        onPress={handleSubmit}
        disabled={isBusy}
        className="mt-1 items-center rounded-full bg-lamp px-5 py-3 active:opacity-80 disabled:opacity-50"
      >
        <Text className="font-semibold text-on-lamp">
          {isBusy
            ? STRINGS.login.working
            : mode === "sign-in"
              ? STRINGS.login.signIn
              : STRINGS.login.createAccount}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          mode === "sign-in" ? STRINGS.login.toSignUp : STRINGS.login.toSignIn
        }
        onPress={handleToggleMode}
        disabled={isBusy}
        className="items-center px-5 py-2 active:opacity-80"
      >
        <Text className="text-sm text-muted">
          {mode === "sign-in" ? STRINGS.login.toSignUp : STRINGS.login.toSignIn}
        </Text>
      </Pressable>
    </View>
  );
}
