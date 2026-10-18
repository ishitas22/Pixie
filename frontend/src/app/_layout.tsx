import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { ConfettiBurst } from "../components/ConfettiBurst";
import { SimilarityPrompt } from "../components/SimilarityPrompt";
import { TypographyProvider } from "../components/Typography";
import { PixieProvider, usePixie } from "../state/PixieProvider";

function Celebrate() {
  const { confetti } = usePixie();
  if (!confetti) {
    return null;
  }
  return <ConfettiBurst key={confetti} />;
}

function SimilarityGate() {
  const { similarity, chooseSimilarity } = usePixie();
  if (!similarity) {
    return null;
  }
  return <SimilarityPrompt newer={similarity.newer} older={similarity.older} onChoose={chooseSimilarity} />;
}

export default function RootLayout() {
  return (
    <TypographyProvider>
      <PixieProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAF9F6" } }} />
          <Celebrate />
          <SimilarityGate />
        </View>
      </PixieProvider>
    </TypographyProvider>
  );
}
