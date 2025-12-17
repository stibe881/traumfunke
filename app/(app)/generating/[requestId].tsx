import { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { StoryRequest, StoryStatus } from '@/types/supabase';
import * as Notifications from 'expo-notifications';
import useI18n from '@/hooks/useI18n';
import { useFocusEffect } from '@react-navigation/native';

const STATUS_CONFIG: Record<string, { labelKey: string; icon: string; progress: number }> = {
    pending: { labelKey: 'generating.pending', icon: '⏳', progress: 0.05 },
    queued: { labelKey: 'generating.queued', icon: '⏳', progress: 0.1 },
    processing: { labelKey: 'generating.processing', icon: '⚙️', progress: 0.15 },
    generating_text: { labelKey: 'generating.generatingText', icon: '✍️', progress: 0.3 },
    generating_images: { labelKey: 'generating.generatingImages', icon: '🎨', progress: 0.6 },
    rendering_clips: { labelKey: 'generating.renderingClips', icon: '🎬', progress: 0.85 },
    finished: { labelKey: 'generating.finished', icon: '🎉', progress: 1 },
    failed: { labelKey: 'generating.failed', icon: '❌', progress: 0 },
};

export default function GeneratingScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const { requestId } = useLocalSearchParams<{ requestId: string }>();
    const [request, setRequest] = useState<StoryRequest | null>(null);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const hasStartedGeneration = useRef(false);

    useEffect(() => {
        // Subscribe to realtime updates
        const channel = supabase
            .channel('story-request-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'story_requests',
                    filter: `id=eq.${requestId}`,
                },
                (payload) => {
                    setRequest(payload.new as StoryRequest);
                }
            )
            .subscribe();

        // Initial load
        loadRequest();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId]);

    useEffect(() => {
        if (request) {
            const config = STATUS_CONFIG[request.status];
            Animated.timing(progressAnim, {
                toValue: config.progress,
                duration: 500,
                useNativeDriver: false,
            }).start();

            // Navigate to story when finished
            if (request.status === 'finished') {
                // Find the story created from this request
                findAndNavigateToStory();
            }
        }
    }, [request?.status]);

    // Reload request status when screen regains focus (e.g., after app was minimized)
    useFocusEffect(
        useCallback(() => {
            loadRequest();
        }, [requestId])
    );

    const loadRequest = async () => {
        const { data } = await supabase
            .from('story_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (data) {
            setRequest(data);

            // If still queued AND we haven't already started generation, start the edge function
            if (data.status === 'queued' && !hasStartedGeneration.current) {
                hasStartedGeneration.current = true;
                startStoryGeneration();
            }
        }
    };

    const startStoryGeneration = async () => {
        try {
            // Update status to processing
            await supabase
                .from('story_requests')
                .update({ status: 'processing' as StoryStatus })
                .eq('id', requestId);

            // Invoke the edge function
            const { error } = await supabase.functions.invoke('create-story', {
                body: { request_id: requestId },
            });

            // Ignore FunctionsFetchError - this means the client timed out but the function
            // continues running in the background and will complete successfully
            if (error && error.name !== 'FunctionsFetchError') {
                console.error('Edge function error:', error);
                await supabase
                    .from('story_requests')
                    .update({
                        status: 'failed' as StoryStatus,
                        error_message: error.message
                    })
                    .eq('id', requestId);
            } else if (error) {
                // FunctionsFetchError - function is still running, just log it
                console.log('Edge function timeout - function continues in background');
            }
        } catch (error: any) {
            // Ignore timeout errors - the edge function continues in background
            if (error?.name === 'FunctionsFetchError' || error?.message?.includes('Failed to send')) {
                console.log('Request timeout - function continues in background');
                return;
            }
            console.error('Error starting story generation:', error);
            await supabase
                .from('story_requests')
                .update({
                    status: 'failed' as StoryStatus,
                    error_message: error.message || 'Unbekannter Fehler'
                })
                .eq('id', requestId);
        }
    };

    const findAndNavigateToStory = async () => {
        const { data: story } = await supabase
            .from('stories')
            .select('id')
            .eq('request_id', requestId)
            .single();

        if (story) {
            setTimeout(() => {
                router.replace(`/(app)/story/${story.id}`);
            }, 1500);
        }
    };

    const handleGoHome = () => {
        router.replace('/(app)/(tabs)/home');
    };

    const currentConfig = request ? STATUS_CONFIG[request.status] : STATUS_CONFIG.queued;
    const isFailed = request?.status === 'failed';
    const isFinished = request?.status === 'finished';

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {/* Status Icon */}
                <View style={styles.iconContainer}>
                    <Text style={styles.statusIcon}>{currentConfig.icon}</Text>
                </View>

                {/* Status Label */}
                <Text style={styles.statusLabel}>{t(currentConfig.labelKey)}</Text>

                {/* Progress Bar */}
                {!isFailed && !isFinished && (
                    <View style={styles.progressContainer}>
                        <View style={styles.progressTrack}>
                            <Animated.View
                                style={[styles.progressFill, { width: progressWidth }]}
                            />
                        </View>
                        <Text style={styles.progressText}>
                            {Math.round(currentConfig.progress * 100)}%
                        </Text>
                    </View>
                )}

                {/* Error Message */}
                {isFailed && request?.error_message && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{request.error_message}</Text>
                    </View>
                )}

                {/* Info Text */}
                {!isFailed && !isFinished && (
                    <Text style={styles.infoText}>
                        {t('generating.backgroundInfo')}
                    </Text>
                )}

                {/* Success Animation */}
                {isFinished && (
                    <View style={styles.successContainer}>
                        <ActivityIndicator size="small" color="#22C55E" />
                        <Text style={styles.successText}>
                            {t('generating.loadingStory')}
                        </Text>
                    </View>
                )}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
                    <Ionicons name="home-outline" size={20} color="#A78BFA" />
                    <Text style={styles.homeButtonText}>{t('generating.goHome')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#2D2640',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 3,
        borderColor: '#4C4270',
    },
    statusIcon: {
        fontSize: 56,
    },
    statusLabel: {
        fontSize: 20,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 24,
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        marginBottom: 32,
    },
    progressTrack: {
        height: 8,
        backgroundColor: '#2D2640',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#7C3AED',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 14,
        color: '#A78BFA',
        textAlign: 'center',
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#EF4444',
    },
    errorText: {
        fontSize: 14,
        color: '#FCA5A5',
        textAlign: 'center',
    },
    notifyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 14,
        gap: 10,
        marginBottom: 20,
    },
    notifyLabel: {
        flex: 1,
        fontSize: 14,
        color: '#F5F3FF',
    },
    infoText: {
        fontSize: 13,
        color: '#6B5B8A',
        textAlign: 'center',
        lineHeight: 20,
    },
    successContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 16,
    },
    successText: {
        fontSize: 14,
        color: '#22C55E',
    },
    footer: {
        padding: 16,
        paddingBottom: 40,
    },
    homeButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#2D2640',
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    homeButtonText: {
        fontSize: 16,
        color: '#A78BFA',
        fontWeight: '500',
    },
});
