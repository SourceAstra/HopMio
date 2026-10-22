import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { call } from '../../../api/client';
import { loadChatHistory, saveChatHistory } from './storage';
import type { ChatMessage } from './types';

type Session = {
  projectId: string;
  version: number;
  encoded: string;
  queue: Promise<void>;
  failed: boolean;
};
const pendingWrites = new Map<string, Promise<void>>();

export function useProjectConversation(projectId: string, welcome: () => ChatMessage[]) {
  const [view, setView] = useState({ projectId, messages: loadChatHistory(projectId) });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const currentId = useRef(projectId);
  currentId.current = projectId;
  const welcomeRef = useRef(welcome);
  welcomeRef.current = welcome;
  const session = useRef<Session | null>(null);
  useEffect(() => {
    let active = true;
    session.current = null;
    setReady(false);
    setError('');
    if (projectId === 'default') {
      session.current = null;
      const cached = loadChatHistory(projectId);
      setView({ projectId, messages: cached.length ? cached : welcomeRef.current() });
      setReady(true);
      return () => {
        active = false;
      };
    }
    void (pendingWrites.get(projectId) || Promise.resolve())
      .then(() =>
        call<{ version: number; messages: ChatMessage[] }>('conversation.get', {
          project_id: projectId,
        }),
      )
      .then((result) => {
        if (!active) return;
        const cached = result.version === 0 ? loadChatHistory(projectId) : [];
        const messages = result.messages.length
          ? result.messages
          : cached.length
            ? cached
            : welcomeRef.current();
        session.current = {
          projectId,
          version: result.version,
          encoded: JSON.stringify(result.messages),
          queue: Promise.resolve(),
          failed: false,
        };
        setView({ projectId, messages });
        setReady(true);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [projectId, reload]);
  useEffect(() => {
    const context = session.current;
    if (
      !ready ||
      !context ||
      view.projectId !== context.projectId ||
      context.projectId !== projectId
    )
      return;
    const messages = view.messages;
    const encoded = JSON.stringify(messages);
    if (encoded === context.encoded) return;
    context.encoded = encoded;
    saveChatHistory(projectId, messages);
    context.queue = context.queue
      .then(async () => {
        if (context.failed) return;
        const result = await call<{ version: number }>('conversation.save', {
          project_id: context.projectId,
          messages,
          expected_version: context.version,
        });
        context.version = result.version;
      })
      .catch((reason) => {
        context.failed = true;
        if (currentId.current === context.projectId && session.current === context) {
          setError((reason as Error).message);
          setReady(false);
        }
      });
    pendingWrites.set(context.projectId, context.queue);
  }, [view, ready, projectId]);
  const setMessages = useCallback(
    (update: SetStateAction<ChatMessage[]>) => {
      setView((previous) =>
        previous.projectId !== projectId
          ? previous
          : {
              projectId,
              messages: typeof update === 'function' ? update(previous.messages) : update,
            },
      );
    },
    [projectId],
  );
  return { messages: view.projectId === projectId ? view.messages : [], setMessages, ready, error,
    retry: () => setReload((value) => value + 1) };
}
