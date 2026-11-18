import { Redirect } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { revealApp, useProfiles } from "@/app-shell";
import { Spinner } from "@/ui";

export default function HomeRoute() {
  const { status, profiles } = useProfiles();

  useEffect(() => {
    if (status === "ready") revealApp();
  }, [status]);
  if (status !== "ready") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  if (profiles.length === 0) return <Redirect href="/settings/servers/add" />;
  return <Redirect href="/webview" />;
}
