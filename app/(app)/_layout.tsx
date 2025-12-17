import { useEffect } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addNotificationResponseListener, addNotificationReceivedListener } from '@/lib/notifications';
import useI18n from '@/hooks/useI18n';

export default function AppLayout() {
    const router = useRouter();
    const { t } = useI18n();

    useEffect(() => {
        // Handle notification tap - navigate to story
        const responseSubscription = addNotificationResponseListener((response) => {
            const data = response.notification.request.content.data;
            if (data?.story_id) {
                router.push(`/(app)/story/${data.story_id}`);
            }
        });

        // N12: Handle notification received while app is in foreground - show in-app alert
        const receiveSubscription = addNotificationReceivedListener((notification) => {
            const { title, body, data } = notification.request.content;

            // Show alert with option to navigate
            Alert.alert(
                title || 'Benachrichtigung',
                body || '',
                data?.story_id
                    ? [
                        { text: 'Später', style: 'cancel' },
                        { text: 'Öffnen', onPress: () => router.push(`/(app)/story/${data.story_id}`) }
                    ]
                    : [{ text: 'OK' }]
            );
        });

        return () => {
            responseSubscription.remove();
            receiveSubscription.remove();
        };
    }, [router]);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
                name="children/index"
                options={{
                    headerShown: true,
                    title: t('children.title'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    headerBackTitle: 'Zurück',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Stack.Screen
                name="children/new"
                options={{
                    headerShown: true,
                    title: t('children.add'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    presentation: 'modal',
                }}
            />
            <Stack.Screen
                name="children/[id]"
                options={{
                    headerShown: true,
                    title: t('children.edit'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    headerBackTitle: 'Zurück',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Stack.Screen name="wizard" options={{ headerShown: false }} />
            <Stack.Screen
                name="generating/[requestId]"
                options={{
                    headerShown: false,
                    gestureEnabled: false,
                }}
            />
            <Stack.Screen
                name="story/[id]"
                options={{
                    headerShown: true,
                    title: t('storyView.title'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Stack.Screen
                name="series/[id]"
                options={{
                    headerShown: true,
                    title: t('series.title'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Stack.Screen
                name="series/[id]/new-episode"
                options={{
                    headerShown: true,
                    title: t('series.newEpisode'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
                        </TouchableOpacity>
                    ),
                }}
            />
            <Stack.Screen
                name="children/[id]/accessibility"
                options={{
                    headerShown: true,
                    title: t('accessibility.title'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={{ paddingHorizontal: 8 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
                        </TouchableOpacity>
                    ),
                }}
            />
        </Stack>
    );
}

