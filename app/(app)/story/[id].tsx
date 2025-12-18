import { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Image,
    Share,
    Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Video, ResizeMode } from 'expo-av';
import AnimatedSceneImage from '@/components/AnimatedSceneImage';
import type { Story, StoryScene, Child } from '@/types/supabase';
import useI18n from '@/hooks/useI18n';

export default function StoryViewerScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { t } = useI18n();
    const [story, setStory] = useState<Story | null>(null);
    const [scenes, setScenes] = useState<StoryScene[]>([]);
    const [children, setChildren] = useState<Child[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        loadStory();
    }, [id]);

    const loadStory = async () => {
        setIsLoading(true);
        try {
            // Load story
            const { data: storyData } = await supabase
                .from('stories')
                .select('*, story_requests(status)')
                .eq('id', id)
                .single();

            // Check if story is ready
            if (storyData?.story_requests && storyData.story_requests.status !== 'finished') {
                Alert.alert(
                    'Noch nicht fertig',
                    'Diese Geschichte wird noch generiert. Bitte gedulde dich noch einen Moment.',
                    [{ text: 'OK', onPress: () => router.back() }]
                );
                setIsLoading(false);
                return;
            }

            if (storyData) setStory(storyData);

            // Load scenes
            const { data: scenesData } = await supabase
                .from('story_scenes')
                .select('*')
                .eq('story_id', id)
                .order('scene_index');

            if (scenesData) setScenes(scenesData);

            // Load children
            const { data: storyChildren } = await supabase
                .from('story_children')
                .select('child_id')
                .eq('story_id', id);

            if (storyChildren && storyChildren.length > 0) {
                const childIds = storyChildren.map(sc => sc.child_id);
                const { data: childrenData } = await supabase
                    .from('children')
                    .select('*')
                    .in('id', childIds);

                if (childrenData) setChildren(childrenData);
            }
        } catch (error) {
            console.error('Error loading story:', error);
        }
        setIsLoading(false);
    };

    const toggleFavorite = async () => {
        if (!story) return;

        try {
            const newValue = !story.is_favorite;
            await supabase
                .from('stories')
                .update({ is_favorite: newValue })
                .eq('id', id);

            setStory({ ...story, is_favorite: newValue });
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const handleExportPDF = async () => {
        if (!story) return;
        setIsExporting(true);

        try {
            const childrenNames = children.map(c => c.name).join(', ') || 'Unbekannt';
            const date = new Date(story.created_at).toLocaleDateString('de-DE');

            const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Georgia, serif; 
              padding: 40px;
              line-height: 1.8;
              color: #333;
            }
            h1 { 
              color: #4A3F35; 
              text-align: center;
              margin-bottom: 10px;
              font-size: 28px;
            }
            .meta {
              text-align: center;
              color: #888;
              margin-bottom: 40px;
              font-size: 14px;
            }
            .paragraph {
              text-indent: 2em;
              margin-bottom: 1.2em;
              font-size: 16px;
            }
            .moral {
              margin-top: 50px;
              padding: 24px;
              background: linear-gradient(135deg, #FFF9E6 0%, #FFF5D6 100%);
              border-radius: 12px;
              font-style: italic;
              border-left: 4px solid #F59E0B;
            }
            .moral strong {
              color: #92400E;
            }
            .footer {
              margin-top: 60px;
              text-align: center;
              color: #aaa;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <h1>${story.title}</h1>
          <p class="meta">
            Eine Geschichte für ${childrenNames}<br>
            Erstellt am ${date}
          </p>
          
          ${story.content.story.map(p =>
                `<p class="paragraph">${p.text}</p>`
            ).join('')}
          
          <div class="moral">
            <strong>Die Moral:</strong> ${story.content.moral_summary}
          </div>
          
          <p class="footer">Erstellt mit Traumfunke 🌙</p>
        </body>
        </html>
      `;

            const { uri } = await Print.printToFileAsync({ html });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: `${story.title} teilen`,
                });
            }
        } catch (error) {
            console.error('Error exporting PDF:', error);
            Alert.alert('Fehler', 'PDF konnte nicht erstellt werden.');
        }
        setIsExporting(false);
    };

    const handleShare = async () => {
        if (!story) return;

        try {
            await Share.share({
                message: `${story.title}\n\n${story.content.story.map(p => p.text).join('\n\n')}\n\n✨ ${story.content.moral_summary}\n\n— Erstellt mit Traumfunke`,
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            'Geschichte löschen',
            'Möchtest du diese Geschichte wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
            [
                { text: 'Abbrechen', style: 'cancel' },
                {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Delete story scenes first
                            await supabase.from('story_scenes').delete().eq('story_id', id);
                            // Delete story children links
                            await supabase.from('story_children').delete().eq('story_id', id);
                            // Delete the story
                            await supabase.from('stories').delete().eq('id', id);

                            // Navigate back
                            router.back();
                        } catch (error) {
                            console.error('Error deleting story:', error);
                            Alert.alert('Fehler', 'Geschichte konnte nicht gelöscht werden.');
                        }
                    },
                },
            ]
        );
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#A78BFA" />
            </View>
        );
    }

    if (!story) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>Geschichte nicht gefunden</Text>
            </View>
        );
    }

    // Find scene for each paragraph
    const getSceneForIndex = (index: number) => {
        let sceneCount = 0;
        for (let i = 0; i <= index; i++) {
            if (story.content.story[i]?.scene_marker) {
                sceneCount++;
            }
        }
        if (story.content.story[index]?.scene_marker) {
            return scenes[sceneCount - 1];
        }
        return null;
    };

    return (
        <>
            <Stack.Screen
                options={{
                    title: story.title,
                    headerRight: () => (
                        <TouchableOpacity onPress={toggleFavorite} style={styles.headerButton}>
                            <Ionicons
                                name={story.is_favorite ? 'heart' : 'heart-outline'}
                                size={24}
                                color={story.is_favorite ? '#F472B6' : '#F5F3FF'}
                            />
                        </TouchableOpacity>
                    ),
                }}
            />

            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>{story.title}</Text>
                    <View style={styles.meta}>
                        {children.length > 0 && (
                            <Text style={styles.metaText}>
                                👧 {children.map(c => c.name).join(', ')}
                            </Text>
                        )}
                        <Text style={styles.metaText}>
                            📅 {new Date(story.created_at).toLocaleDateString('de-DE')}
                        </Text>
                        {story.reading_time_minutes && (
                            <Text style={styles.metaText}>
                                ⏱️ {story.reading_time_minutes} Min.
                            </Text>
                        )}
                    </View>
                </View>

                {/* Story Content */}
                <View style={styles.storyContent}>
                    {story.content.story.map((paragraph, index) => {
                        const scene = getSceneForIndex(index);

                        return (
                            <View key={index}>
                                {/* Scene Media with Ken-Burns Animation */}
                                {scene && (
                                    <View style={styles.sceneContainer}>
                                        {scene.video_url ? (
                                            <Video
                                                source={{ uri: scene.video_url }}
                                                style={styles.sceneMedia}
                                                resizeMode={ResizeMode.COVER}
                                                shouldPlay
                                                isLooping
                                                isMuted
                                            />
                                        ) : scene.image_url ? (
                                            <AnimatedSceneImage imageUrl={scene.image_url} />
                                        ) : null}
                                    </View>
                                )}

                                {/* Paragraph */}
                                <Text style={styles.paragraph}>{paragraph.text}</Text>
                            </View>
                        );
                    })}
                </View>

                {/* Moral */}
                <View style={styles.moralContainer}>
                    <Text style={styles.moralLabel}>✨ Die Moral der Geschichte</Text>
                    <Text style={styles.moralText}>{story.content.moral_summary}</Text>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleExportPDF}
                        disabled={isExporting}
                    >
                        {isExporting ? (
                            <ActivityIndicator size="small" color="#A78BFA" />
                        ) : (
                            <Ionicons name="document-outline" size={22} color="#A78BFA" />
                        )}
                        <Text style={styles.actionText}>PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                        <Ionicons name="share-outline" size={22} color="#A78BFA" />
                        <Text style={styles.actionText}>Teilen</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Ionicons name="trash-outline" size={22} color="#EF4444" />
                        <Text style={styles.deleteText}>Löschen</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </>
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
    headerButton: {
        padding: 8,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 28,
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#F5F3FF',
        lineHeight: 34,
        marginBottom: 12,
    },
    meta: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metaText: {
        fontSize: 13,
        color: '#8B7FA8',
    },
    storyContent: {
        marginBottom: 28,
    },
    paragraph: {
        fontSize: 17,
        lineHeight: 28,
        color: '#E9E3F5',
        marginBottom: 20,
    },
    sceneContainer: {
        marginBottom: 20,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    sceneMedia: {
        width: '100%',
        height: 200,
        backgroundColor: '#2D2640',
    },
    moralContainer: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderLeftWidth: 4,
        borderLeftColor: '#F59E0B',
    },
    moralLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#F59E0B',
        marginBottom: 8,
    },
    moralText: {
        fontSize: 16,
        fontStyle: 'italic',
        color: '#F5F3FF',
        lineHeight: 24,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    actionText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#A78BFA',
    },
    deleteButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    deleteText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#EF4444',
    },
    errorText: {
        fontSize: 16,
        color: '#8B7FA8',
    },
});
