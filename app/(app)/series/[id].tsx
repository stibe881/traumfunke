import { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import type { Series, SeriesEpisode, Moral } from '@/types/supabase';
import useI18n from '@/hooks/useI18n';

interface EpisodeWithMoral extends SeriesEpisode {
    moral_text?: string;
    subtitle?: string;
    story?: {
        id: string;
        title: string;
        subtitle?: string;
        reading_time_minutes: number;
    };
}

export default function SeriesDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const { t } = useI18n();
    const [series, setSeries] = useState<Series | null>(null);
    const [episodes, setEpisodes] = useState<EpisodeWithMoral[]>([]);
    const [morals, setMorals] = useState<Moral[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [highlightedEpisodeId, setHighlightedEpisodeId] = useState<string | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const episodeRefs = useRef<{ [key: string]: number }>({});

    useFocusEffect(
        useCallback(() => {
            loadSeriesData();
            loadMorals();
        }, [id])
    );

    const loadSeriesData = async () => {
        setIsLoading(true);
        try {
            // Load series
            const { data: seriesData, error: seriesError } = await supabase
                .from('series')
                .select('*')
                .eq('id', id)
                .single();

            if (seriesError) throw seriesError;
            setSeries(seriesData);

            // Load episodes with story data
            const { data: episodesData, error: episodesError } = await supabase
                .from('series_episodes')
                .select('*, story:stories(id, title, subtitle, reading_time_minutes)')
                .eq('series_id', id)
                .order('episode_number', { ascending: true });

            if (episodesError) throw episodesError;
            setEpisodes(episodesData || []);
        } catch (error) {
            console.error('Error loading series:', error);
            Alert.alert('Fehler', 'Serie konnte nicht geladen werden.');
        } finally {
            setIsLoading(false);
        }
    };

    const loadMorals = async () => {
        const { data } = await supabase
            .from('morals')
            .select('*')
            .order('sort_order');
        setMorals(data || []);
    };

    const getMoralText = (moralKey: string) => {
        if (moralKey === 'none') return 'Keine Moral';
        const moral = morals.find(m => m.slug === moralKey);
        return moral?.text || moralKey;
    };

    const handleNewEpisode = () => {
        router.push(`/(app)/series/${id}/new-episode`);
    };

    const handleViewEpisode = (storyId: string) => {
        router.push(`/(app)/story/${storyId}`);
    };

    const handleDeleteSeries = () => {
        Alert.alert(
            'Serie löschen',
            `Möchtest du "${series?.title || 'diese Serie'}" wirklich löschen? Alle Folgen und zugehörigen Geschichten werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
            [
                { text: 'Abbrechen', style: 'cancel' },
                {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Delete all stories linked to this series's episodes first
                            const storyIds = episodes
                                .filter(ep => ep.story?.id)
                                .map(ep => ep.story!.id);

                            if (storyIds.length > 0) {
                                await supabase
                                    .from('stories')
                                    .delete()
                                    .in('id', storyIds);
                            }

                            // Delete series episodes (should cascade if FK set up properly, but do it explicitly)
                            await supabase
                                .from('series_episodes')
                                .delete()
                                .eq('series_id', id);

                            // Delete the series itself
                            const { error } = await supabase
                                .from('series')
                                .delete()
                                .eq('id', id);

                            if (error) throw error;

                            router.back();
                        } catch (error) {
                            console.error('Error deleting series:', error);
                            Alert.alert('Fehler', 'Die Serie konnte nicht gelöscht werden.');
                        }
                    },
                },
            ]
        );
    };

    const handleExportSeries = async () => {
        if (episodes.length === 0) {
            Alert.alert('Keine Folgen', 'Es gibt noch keine Folgen zum Exportieren.');
            return;
        }

        try {
            // Load full story content for all episodes
            const storyIds = episodes.filter(ep => ep.story?.id).map(ep => ep.story!.id);
            const { data: stories } = await supabase
                .from('stories')
                .select('id, title, subtitle, content, recap_text')
                .in('id', storyIds);

            if (!stories || stories.length === 0) {
                Alert.alert('Fehler', 'Keine Geschichten gefunden.');
                return;
            }

            // Build export text
            let exportText = `📚 ${series?.title || 'Serie'}\n`;
            exportText += `${'='.repeat(40)}\n\n`;

            episodes.forEach((ep, index) => {
                const story = stories.find(s => s.id === ep.story?.id);
                if (!story) return;

                exportText += `\n📖 Folge ${ep.episode_number}`;
                if (ep.subtitle || story.subtitle) {
                    exportText += `: ${ep.subtitle || story.subtitle}`;
                }
                exportText += `\n${'-'.repeat(30)}\n\n`;

                // Add recap for episodes 2+
                if (ep.episode_number > 1 && story.recap_text) {
                    exportText += `🔄 Rückblick:\n${story.recap_text}\n\n`;
                }

                // Add story text
                if (story.content?.story && Array.isArray(story.content.story)) {
                    story.content.story.forEach((paragraph: any) => {
                        exportText += `${paragraph.text}\n\n`;
                    });
                }

                // Add moral if present
                const moralText = getMoralText(ep.moral_key);
                if (moralText !== 'Keine Moral') {
                    exportText += `\n💡 Moral: ${moralText}\n`;
                }

                exportText += `\n`;
            });

            await Share.share({
                message: exportText,
                title: series?.title || 'Serie exportieren',
            });
        } catch (error) {
            console.error('Error exporting series:', error);
            Alert.alert('Fehler', 'Die Serie konnte nicht exportiert werden.');
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#A78BFA" />
            </View>
        );
    }

    if (!series) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Serie nicht gefunden</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Series Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <View style={styles.headerContent}>
                            <Text style={styles.title}>{series.title || 'Unbenannte Serie'}</Text>
                            <Text style={styles.meta}>
                                {series.category?.name || 'Frei'} • {series.mode === 'fixed'
                                    ? `${episodes.length}/${series.planned_episodes} Folgen`
                                    : `${episodes.length} Folgen`}
                                {series.is_finished && ' • ✅ Abgeschlossen'}
                            </Text>
                        </View>
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                style={styles.editButton}
                                onPress={() => router.push(`/(app)/series/${id}/edit`)}
                            >
                                <Ionicons name="pencil-outline" size={22} color="#A78BFA" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.exportButton}
                                onPress={handleExportSeries}
                            >
                                <Ionicons name="share-outline" size={22} color="#22C55E" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={handleDeleteSeries}
                            >
                                <Ionicons name="trash-outline" size={22} color="#EF4444" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Moral History */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📜 Moral-Verlauf</Text>
                    {episodes.length === 0 ? (
                        <Text style={styles.emptyText}>Noch keine Folgen erstellt</Text>
                    ) : (
                        <View style={styles.moralHistory}>
                            {episodes.map((ep) => (
                                <TouchableOpacity
                                    key={ep.id}
                                    style={styles.moralItem}
                                    onPress={() => {
                                        setHighlightedEpisodeId(ep.id);
                                        // Scroll to episode (approximate position based on index)
                                        const episodeIndex = episodes.findIndex(e => e.id === ep.id);
                                        const scrollPosition = 400 + (episodeIndex * 80); // Header + list offset
                                        scrollViewRef.current?.scrollTo({ y: scrollPosition, animated: true });
                                        // Clear highlight after 2 seconds
                                        setTimeout(() => setHighlightedEpisodeId(null), 2000);
                                    }}
                                >
                                    <Text style={styles.moralEpisode}>Folge {ep.episode_number}</Text>
                                    <Text style={styles.moralText}>{getMoralText(ep.moral_key)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Episodes List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📚 Folgen</Text>
                    {episodes.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>🎬</Text>
                            <Text style={styles.emptyTitle}>Keine Folgen</Text>
                            <Text style={styles.emptySubtitle}>
                                Starte deine erste Folge und beginne das Abenteuer!
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.episodeList}>
                            {episodes.map((ep) => (
                                <TouchableOpacity
                                    key={ep.id}
                                    style={[
                                        styles.episodeCard,
                                        highlightedEpisodeId === ep.id && styles.episodeCardHighlighted
                                    ]}
                                    onPress={() => ep.story?.id && handleViewEpisode(ep.story.id)}
                                >
                                    <View style={styles.episodeNumber}>
                                        <Text style={styles.episodeNumberText}>{ep.episode_number}</Text>
                                    </View>
                                    <View style={styles.episodeContent}>
                                        <Text style={styles.episodeTitle}>
                                            Folge {ep.episode_number}{ep.subtitle || ep.story?.subtitle ? `: ${ep.subtitle || ep.story?.subtitle}` : ''}
                                        </Text>
                                        <Text style={styles.episodeMeta}>
                                            {ep.story?.reading_time_minutes || 0} Min •
                                            {ep.is_final ? ' 🏁 Finale' : ' 📍 Cliffhanger'}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#8B7FA8" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* New Episode Button */}
            {!series.is_finished && (
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.newEpisodeButton}
                        onPress={handleNewEpisode}
                    >
                        <Ionicons name="add-circle" size={24} color="#FFFFFF" />
                        <Text style={styles.newEpisodeText}>Weiter mit der Geschichte</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1625',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1625',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 16,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 100,
    },
    header: {
        marginBottom: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    headerContent: {
        flex: 1,
        marginRight: 12,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    editButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    exportButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#F5F3FF',
        marginBottom: 8,
    },
    meta: {
        fontSize: 14,
        color: '#8B7FA8',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#A78BFA',
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 14,
        color: '#6B5B8A',
        fontStyle: 'italic',
    },
    moralHistory: {
        gap: 8,
    },
    moralItem: {
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    moralEpisode: {
        fontSize: 13,
        fontWeight: '600',
        color: '#A78BFA',
        width: 70,
    },
    moralText: {
        flex: 1,
        fontSize: 13,
        color: '#E9E3F5',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#8B7FA8',
        textAlign: 'center',
    },
    episodeList: {
        gap: 10,
    },
    episodeCard: {
        backgroundColor: '#2D2640',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    episodeCardHighlighted: {
        backgroundColor: '#3D2F60',
        borderColor: '#A78BFA',
        borderWidth: 2,
        shadowColor: '#A78BFA',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    episodeNumber: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#7C3AED',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    episodeNumberText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    episodeContent: {
        flex: 1,
    },
    episodeTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    episodeMeta: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 32,
        backgroundColor: '#1A1625',
        borderTopWidth: 1,
        borderTopColor: '#2D2640',
    },
    newEpisodeButton: {
        backgroundColor: '#7C3AED',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    newEpisodeText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    },
});
