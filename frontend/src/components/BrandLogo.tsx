import { Image, View } from 'react-native';
export function BrandLogo() {
  // Crop the original image's white margins in the viewport, preserving its proportions.
  return <View style={{ width: 48, height: 36, overflow: 'hidden' }}><Image source={require('../../assets/Pixie.png')} accessibilityLabel="Pixie logo" resizeMode="contain" style={{ position: 'absolute', width: 54, height: 54, left: -4, top: -8 }} /></View>;
}
