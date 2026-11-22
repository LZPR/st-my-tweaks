import { autoExpandEditor } from './auto-expand-editor.js';
import { expandedEditorShortcuts } from './expanded-editor-shortcuts.js';
import { promptEditHistory } from './prompt-edit-history.js';
import { plistEditor } from './plist-editor.js';
import { randomName } from './random-name.js';
import { messageMenu } from './message-menu.js';
import { storyRoutes } from './story-routes.js';
import { assistantChat } from './assistant-chat.js';

export const tools = [autoExpandEditor, expandedEditorShortcuts, promptEditHistory, plistEditor, randomName, messageMenu, storyRoutes, assistantChat];
