import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { theme } from "../theme";

const colors = [
  theme.colors.lavender,
  theme.colors.pink,
  theme.colors.teal,
  theme.colors.yellow,
  theme.colors.purple,
  theme.colors.paleGreen,
];

export function ConfettiBurst() {
  const pieces = useRef(
    colors.flatMap((color, index) =>
      [0, 1].map((copy) => ({
        color,
        anim: new Animated.Value(0),
        dx: (index % 2 === 0 ? -1 : 1) * (10 + index * 7 + copy * 4),
        dy: -16 - index * 6 - copy * 8,
      })),
    ),
  ).current;

  useEffect(() => {
    const animation = Animated.stagger(
      18,
      pieces.map((piece) => Animated.timing(piece.anim, { toValue: 1, duration: 680, useNativeDriver: true })),
    );
    animation.start();
    return () => animation.stop();
  }, [pieces]);

  return (
    <View pointerEvents="none" accessibilityElementsHidden style={{ position: "absolute", top: 86, alignSelf: "center", width: 8, height: 8, zIndex: 30 }}>
      {pieces.map((piece, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            width: 7,
            height: 9,
            borderRadius: 2,
            backgroundColor: piece.color,
            opacity: piece.anim.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: piece.anim.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dx] }) },
              { translateY: piece.anim.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dy] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
