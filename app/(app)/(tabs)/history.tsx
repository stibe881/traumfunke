import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import type { Story } from '@/types/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SwipeableStoryCard from '@/components/SwipeableStoryCard';
import useI18n from '@/hooks/useI18n';

export default function HistoryScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { t } = useI18n();
    const [stories, setStories] = useState<Story[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');

    useFocusEffect(
        useCallback(() => {
            loadStories();
        }, [filter])
    );

    const loadStories = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('stories')
                .select('*, story_requests(status)')
                .eq('user_id', user?.id)
                .is('series_id', null) // Only show standalone stories, not series episodes
                .order('created_at', { ascending: false });

            if (filter === 'favorites') {
                query = query.eq('is_favorite', true);
            }

            const { data } = await query;
            if (data) {
                const finishedStories = data.filter((s: any) =>
                    !s.story_requests || s.story_requests.status === 'finished'
                );
                setStories(finishedStories);
            }
        } catch (error) {
            console.error('Error loading stories:', error);
        }
        setIsLoading(false);
    };

    const toggleFavorite = async (story: Story) => {
        try {
            await supabase
                .from('stories')
                .update({ is_favorite: !story.is_favorite })
                .eq('id', story.id);

            setStories(prev =>
                prev.map(s =>
                    s.id === story.id ? { ...s, is_favorite: !s.is_favorite } : s
                )
            );
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const handleDelete = (storyId: string) => {
        setStories(prev => prev.filter(s => s.id !== storyId));
    };

    const renderStory = ({ item }: { item: Story }) => (
        <SwipeableStoryCard
            story={item}
            onPress={() => router.push(`/(app)/story/${item.id}`)}
            onToggleFavorite={() => toggleFavorite(item)}
            onDelete={() => handleDelete(item.id)}
        />
    );

    const ListEmptyComponent = () => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>
                {filter === 'favorites' ? '💜' : '📚'}
            </Text>
            <Text style={styles.emptyTitle}>
                {filter === 'favorites' ? t('history.noFavorites') : t('stories.empty')}
            </Text>
            <Text style={styles.emptyText}>
                {filter === 'favorites'
                    ? t('history.noFavoritesHint')
                    : t('history.noStoriesHint')}
            </Text>
            {filter === 'all' && (
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => router.push('/(app)/wizard')}
                >
                    <Text style={styles.createButtonText}>{t('home.createStory')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <GestureHandlerRootView style={styles.container}>
            {/* Filter Tabs */}
            <View style={styles.filterContainer}>
                <TouchableOpacity
                    style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                    onPress={() => setFilter('all')}
                >
                    <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
                        {t('history.all')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterTab, filter === 'favorites' && styles.filterTabActive]}
                    onPress={() => setFilter('favorites')}
                >
                    <Ionicons
                        name="heart"
                        size={16}
                        color={filter === 'favorites' ? '#F5F3FF' : '#8B7FA8'}
                        style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.filterText, filter === 'favorites' && styles.filterTextActive]}>
                        {t('history.favorites')}
                    </Text>
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#A78BFA" />
                </View>
            ) : (
                <FlatList
                    data={stories}
                    renderItem={renderStory}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={ListEmptyComponent}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                />
            )}

            {/* FAB for new story */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => {
                    Alert.alert(
                        t('stories.newStoryTitle'),
                        t('stories.newStoryMessage'),
                        [
                            {
                                text: t('stories.aiGenerate'),
                                onPress: () => router.push('/(app)/wizard/'),
                            },
                            {
                                text: t('stories.writeOwn'),
                                onPress: () => router.push('/(app)/story/custom'),
                            },
                            {
                                text: t('common.cancel'),
                                style: 'cancel',
                            },
                        ]
                    );
                }}
            >
                <Ionicons name="add" size={28} color="#FFFFFF" />
            </TouchableOpacity>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    filterTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: '#2D2640',
    },
    filterTabActive: {
        backgroundColor: '#7C3AED',
    },
    filterText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#8B7FA8',
    },
    filterTextActive: {
        color: '#F5F3FF',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: 16,
        paddingTop: 8,
    },
    storyCard: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    storyIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#3D3255',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    storyIconText: {
        fontSize: 24,
    },
    storyContent: {
        flex: 1,
        marginRight: 8,
    },
    storyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 4,
        lineHeight: 22,
    },
    storyMeta: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    favoriteButton: {
        padding: 8,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#8B7FA8',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    createButton: {
        backgroundColor: '#7C3AED',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
    },
    createButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#7C3AED',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
});
