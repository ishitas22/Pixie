import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PixieProvider } from '../state/PixieProvider';
import { TypographyProvider } from '../components/Typography';
export default function RootLayout() { return <TypographyProvider><PixieProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAF9F6' } }} /></PixieProvider></TypographyProvider>; }
