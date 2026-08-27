import { Slot, usePathname } from "expo-router";

import { LogoMark } from "@/components/logo-mark";
import { STRINGS } from "@/lib/strings";
import { Link, Text, View } from "@/tw";

const TABS = [
  { href: "/", label: "Tonight" },
  { href: "/crew", label: "Crew" },
] as const;

/* Web variant: a slim top bar instead of a bottom tab bar; the routes and
   screens are identical to native (sanctioned divergence: navigation chrome). */
export function AppTabs() {
  const pathname = usePathname();

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line bg-bg">
        <View className="w-full max-w-3xl flex-row items-center justify-between self-center px-4 py-3">
          <View className="flex-row items-center gap-2">
            <LogoMark className="h-6 w-6" />
            <Link href="/" className="font-display text-2xl text-ink">
              {STRINGS.appName.toUpperCase()}
              <Text className="text-lamp">.</Text>
            </Link>
          </View>
          <View className="flex-row items-center gap-5">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "font-display text-base tracking-[2px] text-lamp uppercase"
                      : "font-display text-base tracking-[2px] text-muted uppercase"
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </View>
        </View>
      </View>
      <Slot />
    </View>
  );
}
