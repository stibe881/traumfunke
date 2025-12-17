import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import type { Child, Story, Series } from '@/types/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import useI18n from '@/hooks/useI18n';
import * as Notifications from 'expo-notifications';
import CoinBalance from '@/components/CoinBalance';

export default function HomeScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { t } = useI18n();
    const [children, setChildren] = useState<Child[]>([]);
    const [recentStories, setRecentStories] = useState<Story[]>([]);
    const [recentSeries, setRecentSeries] = useState<(Series & { episode_count: number })[]>([]);
    const [recentViewMode, setRecentViewMode] = useState<'stories' | 'series'>('stories');
    const [pendingRequest, setPendingRequest] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const birthdayCheckedRef = useRef(false);

    // Check birthdays once per session
    useEffect(() => {
        if (children.length > 0 && !birthdayCheckedRef.current) {
            checkBirthdays(children);
            birthdayCheckedRef.current = true;
        }
    }, [children]);

    const checkBirthdays = async (childrenList: Child[]) => {
        const today = new Date();
        const todayMonth = today.getMonth();
        const todayDate = today.getDate();

        const birthdayChildren = childrenList.filter(child => {
            // Since we only store age, we'll check if today could be a birthday
            // This is a simplified version - with real birthDate in DB, we'd check exact date
            // For now, we'll skip this check until birthDate is stored in DB
            return false;
        });

        if (birthdayChildren.length > 0) {
            const names = birthdayChildren.map(c => c.name).join(', ');

            // Show alert
            Alert.alert(
                '🎂 Geburtstag!',
                `Heute hat ${names} Geburtstag! 🎉\n\nWie wäre es mit einer besonderen Geburtstags-Geschichte?`,
                [
                    { text: 'Später', style: 'cancel' },
                    {
                        text: 'Geschichte erstellen',
                        onPress: () => router.push('/(app)/wizard/')
                    },
                ]
            );

            // Also schedule a notification
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '🎂 Geburtstag!',
                    body: `${names} hat heute Geburtstag! Erstelle eine besondere Geschichte.`,
                },
                trigger: null, // Send immediately
            });
        }
    };

    // Reload data when screen gains focus (not just on mount)
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [user?.id])
    );

    // Subscribe to realtime updates for story requests
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel('home-story-request-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'story_requests',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('Story request update:', payload);
                    // Reload pending request on any change
                    loadPendingRequest();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load children
            const { data: childrenData } = await supabase
                .from('children')
                .select('*')
                .eq('user_id', user?.id)
                .order('name');

            if (childrenData) setChildren(childrenData);

            // Load recent stories (excluding series episodes for cleaner list)
            const { data: storiesData } = await supabase
                .from('stories')
                .select('*')
                .eq('user_id', user?.id)
                .is('series_id', null)
                .order('created_at', { ascending: false })
                .limit(3);

            if (storiesData) setRecentStories(storiesData);

            // Load recent series with episode count
            const { data: seriesData } = await supabase
                .from('series')
                .select('*, series_episodes(count)')
                .eq('user_id', user?.id)
                .order('updated_at', { ascending: false })
                .limit(3);

            if (seriesData) {
                const seriesWithCount = seriesData.map((s: any) => ({
                    ...s,
                    episode_count: s.series_episodes?.[0]?.count || 0,
                }));
                setRecentSeries(seriesWithCount);
            }

            // Load pending request separately
            await loadPendingRequest();
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    // Separate function to load pending request - can be called independently
    const loadPendingRequest = async () => {
        try {
            // Use maybeSingle() instead of single() to avoid throwing when no row exists
            const { data: pendingData, error } = await supabase
                .from('story_requests')
                .select('*')
                .eq('user_id', user?.id)
                .in('status', ['pending', 'queued', 'processing', 'generating_text', 'generating_images'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('Error loading pending request:', error);
                setPendingRequest(null);
            } else {
                setPendingRequest(pendingData);
            }
        } catch (error) {
            console.error('Error loading pending request:', error);
            setPendingRequest(null);
        }
    };

    const handleStartWizard = () => {
        if (children.length === 0) {
            router.push('/(app)/children/new');
        } else {
            router.push('/(app)/wizard');
        }
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#A78BFA" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.greeting}>{t('home.greeting')}</Text>
                        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
                    </View>
                    <CoinBalance />
                </View>

                {/* Pending Generation Banner */}
                {pendingRequest && (
                    <TouchableOpacity
                        style={styles.pendingBanner}
                        onPress={() => router.push(`/(app)/generating/${pendingRequest.id}`)}
                    >
                        <View style={styles.pendingIcon}>
                            <ActivityIndicator size="small" color="#7C3AED" />
                        </View>
                        <View style={styles.pendingContent}>
                            <Text style={styles.pendingTitle}>{t('home.storyCreating')}</Text>
                            <Text style={styles.pendingStatus}>
                                {(pendingRequest.status === 'pending' || pendingRequest.status === 'queued') && t('home.waitingStart')}
                                {pendingRequest.status === 'processing' && t('home.processing')}
                                {pendingRequest.status === 'generating_text' && t('home.generatingText')}
                                {pendingRequest.status === 'generating_images' && t('home.generatingImages')}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#A78BFA" />
                    </TouchableOpacity>
                )}

                {/* Main Action Card */}
                <TouchableOpacity style={styles.mainCard} onPress={handleStartWizard}>
                    <View style={styles.mainCardContent}>
                        <Text style={styles.mainCardEmoji}>✨</Text>
                        <Text style={styles.mainCardTitle}>
                            {children.length === 0
                                ? t('home.addFirstChild')
                                : t('home.newStory')
                            }
                        </Text>
                        <Text style={styles.mainCardSubtitle}>
                            {children.length === 0
                                ? t('home.addFirstChildHint')
                                : t('home.createPersonalized')
                            }
                        </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={24} color="#F5F3FF" />
                </TouchableOpacity>

                {/* Children Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('home.myChildren')}</Text>
                        <TouchableOpacity onPress={() => router.push('/(app)/children/')}>
                            <Text style={styles.seeAllButton}>{t('home.viewAll')}</Text>
                        </TouchableOpacity>
                    </View>

                    {children.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>👶</Text>
                            <Text style={styles.emptyText}>
                                {t('home.noChildren')}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.childrenList}
                        >
                            {children.map((child) => (
                                <TouchableOpacity
                                    key={child.id}
                                    style={styles.childCard}
                                    onPress={() => router.push(`/(app)/children/${child.id}`)}
                                >
                                    <View style={styles.childAvatar}>
                                        {child.photo_url ? (
                                            <Image source={{ uri: child.photo_url }} style={styles.childAvatarImage} />
                                        ) : (
                                            <Text style={styles.childAvatarText}>
                                                {child.gender === 'Junge' ? '👦' : child.gender === 'Maedchen' ? '👧' : '🧒'}
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={styles.childName}>{child.name}</Text>
                                    <Text style={styles.childAge}>{child.age} {t('home.years')}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                style={[styles.childCard, styles.addChildCard]}
                                onPress={() => router.push('/(app)/children/new')}
                            >
                                <Ionicons name="add-circle" size={40} color="#7C3AED" />
                                <Text style={styles.addChildText}>{t('home.addChild')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </View>

                {/* Recent Stories/Series Section with Toggle */}
                {(recentStories.length > 0 || recentSeries.length > 0) && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            {/* Toggle Buttons */}
                            <View style={styles.toggleContainer}>
                                <TouchableOpacity
                                    style={[styles.toggleButton, recentViewMode === 'stories' && styles.toggleButtonActive]}
                                    onPress={() => setRecentViewMode('stories')}
                                >
                                    <Text style={[styles.toggleText, recentViewMode === 'stories' && styles.toggleTextActive]}>
                                        📖 Geschichten
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleButton, recentViewMode === 'series' && styles.toggleButtonActive]}
                                    onPress={() => setRecentViewMode('series')}
                                >
                                    <Text style={[styles.toggleText, recentViewMode === 'series' && styles.toggleTextActive]}>
                                        📚 Serien
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => router.push(recentViewMode === 'stories' ? '/(app)/(tabs)/history' : '/(app)/(tabs)/series')}>
                                <Text style={styles.seeAllButton}>{t('home.viewAll')}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Stories View */}
                        {recentViewMode === 'stories' && recentStories.map((story) => (
                            <TouchableOpacity
                                key={story.id}
                                style={styles.storyCard}
                                onPress={() => router.push(`/(app)/story/${story.id}`)}
                            >
                                <View style={styles.storyIcon}>
                                    <Text>📖</Text>
                                </View>
                                <View style={styles.storyInfo}>
                                    <Text style={styles.storyTitle} numberOfLines={1}>
                                        {story.title}
                                    </Text>
                                    <Text style={styles.storyMeta}>
                                        {new Date(story.created_at).toLocaleDateString('de-DE')}
                                        {story.reading_time_minutes && ` • ${story.reading_time_minutes} Min.`}
                                    </Text>
                                </View>
                                {story.is_favorite && (
                                    <Ionicons name="heart" size={20} color="#F472B6" />
                                )}
                            </TouchableOpacity>
                        ))}

                        {/* Series View */}
                        {recentViewMode === 'series' && recentSeries.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.storyCard}
                                onPress={() => router.push(`/(app)/series/${item.id}`)}
                            >
                                <View style={styles.storyIcon}>
                                    <Text>📚</Text>
                                </View>
                                <View style={styles.storyInfo}>
                                    <Text style={styles.storyTitle} numberOfLines={1}>
                                        {item.title || 'Unbenannte Serie'}
                                    </Text>
                                    <Text style={styles.storyMeta}>
                                        {item.episode_count} {item.episode_count === 1 ? 'Folge' : 'Folgen'}
                                        {item.is_finished && ' • ✅ Fertig'}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#8B7FA8" />
                            </TouchableOpacity>
                        ))}

                        {/* Empty states */}
                        {recentViewMode === 'stories' && recentStories.length === 0 && (
                            <Text style={styles.emptyText}>Noch keine Geschichten erstellt</Text>
                        )}
                        {recentViewMode === 'series' && recentSeries.length === 0 && (
                            <Text style={styles.emptyText}>Noch keine Serien erstellt</Text>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    headerLeft: {
        flex: 1,
    },
    greeting: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
        color: '#A78BFA',
    },
    mainCard: {
        backgroundColor: '#7C3AED',
        borderRadius: 20,
        padding: 24,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 32,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    mainCardContent: {
        flex: 1,
    },
    mainCardEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    mainCardTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    mainCardSubtitle: {
        fontSize: 14,
        color: '#E9D5FF',
    },
    section: {
        marginBottom: 28,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F3FF',
    },
    seeAllButton: {
        fontSize: 14,
        color: '#A78BFA',
        fontWeight: '500',
    },
    emptyState: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#4C4270',
        borderStyle: 'dashed',
    },
    emptyIcon: {
        fontSize: 40,
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 14,
        color: '#8B7FA8',
        textAlign: 'center',
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#2D2640',
        borderRadius: 10,
        padding: 3,
    },
    toggleButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    toggleButtonActive: {
        backgroundColor: '#7C3AED',
    },
    toggleText: {
        fontSize: 13,
        color: '#8B7FA8',
        fontWeight: '500',
    },
    toggleTextActive: {
        color: '#FFFFFF',
    },
    childrenList: {
        gap: 12,
    },
    childCard: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        width: 100,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    childAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#3D3255',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    childAvatarText: {
        fontSize: 24,
    },
    childAvatarImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    childName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 2,
    },
    childAge: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    addChildCard: {
        justifyContent: 'center',
        borderStyle: 'dashed',
    },
    addChildText: {
        fontSize: 12,
        color: '#7C3AED',
        marginTop: 4,
    },
    storyCard: {
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    storyIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#3D3255',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    storyInfo: {
        flex: 1,
    },
    storyTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 2,
    },
    storyMeta: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    // Pending generation banner
    pendingBanner: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#7C3AED',
    },
    pendingIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    pendingContent: {
        flex: 1,
    },
    pendingTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 2,
    },
    pendingStatus: {
        fontSize: 13,
        color: '#A78BFA',
    },
});
