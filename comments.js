// 投稿欄とチャット表示領域を、後続の処理から使えるよう最初に取得する。
const message = document.getElementById("message");
const chat = document.getElementById("chat");
let suppressInitialScrollRestore =
    window.matchMedia("(max-width: 700px)").matches;
// ページ再表示時のレイアウト移動を抑えるため、高さを保存する。
const reservedMessageLayoutHeightKey = "message-layout-reserved-height";
const reservedMessageInputHeightKey = "message-input-reserved-height";
// 前回のページ離脱時に保存した値を読み込み、初期描画時の高さとして再利用する。
const reservedMessageLayoutHeight =
    sessionStorage.getItem(reservedMessageLayoutHeightKey);
const reservedMessageInputHeight =
    sessionStorage.getItem(reservedMessageInputHeightKey);
// チャット領域の予約高をCSSカスタムプロパティに戻し、描画の揺れを防ぐ。
if (reservedMessageLayoutHeight !== null) {
    document.documentElement.style.setProperty(
        "--message-layout-reserved-height",
        reservedMessageLayoutHeight
    );
}
// 領域と入力欄の両方の高さが保存されている場合だけ、予約用クラスを有効にする。
if (
    reservedMessageLayoutHeight !== null &&
    reservedMessageInputHeight !== null
) {
    document.body.classList.add("message-layout-size-reserved");
}
// 入力欄の高さも復元し、画面の初期レイアウトを前回に近づける。
if (reservedMessageInputHeight !== null) {
    document.documentElement.style.setProperty(
        "--message-input-reserved-height",
        reservedMessageInputHeight
    );
}
function saveMessageLayoutSize() {
    // 読み込み前の不完全なサイズや、対象要素がない状態は保存しない。
    const messageLayout = document.getElementById("message-layout");
    if (messageLayout && document.body.classList.contains("comments-ready")) {
        sessionStorage.setItem(
            reservedMessageLayoutHeightKey,
            messageLayout.getBoundingClientRect().height + "px"
        );
        sessionStorage.setItem(
            reservedMessageInputHeightKey,
            message.getBoundingClientRect().height + "px"
        );
    }
}
// ページが隠れたり閉じたりする直前に現在の高さを記録する。
window.addEventListener("pagehide", saveMessageLayoutSize);

// 直近表示では画面上に収まる行数を目安にし、過去分の取得単位を別に管理する。
const recentMessageLineLimit = 30;
const olderMessageChunkSize = 50;
const olderMessageFetchSize = 1000;

// 新しい投稿と、過去投稿の折りたたみグループを別々の領域に配置する。
const recentMessagesContainer = document.createElement("div");
const olderMessagesContainer = document.createElement("div");

// 過去投稿の開始位置、取得状態、非同期再読込の世代番号を保持する。
let oldestRecentMessageId = null;
let olderMessageGroupsLoading = false;
let olderMessageGroupsLoaded = false;
let messageLoadVersion = 0;
recentMessagesContainer.className = "chat-recent-messages";
olderMessagesContainer.className = "chat-older-messages";
// チャット要素の既存内容を専用コンテナに置き換える。
chat.replaceChildren(
    recentMessagesContainer,
    olderMessagesContainer
);

function formatMessageDate(row) {
    // DBの日時をローカル時刻で表示し、時分秒は常に2桁にそろえる。
    const date = new Date(row.created_at);

    return (
        date.getFullYear() + "/" +
        (date.getMonth() + 1) + "/" +
        date.getDate() + " " +
        String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0") + ":" +
        String(date.getSeconds()).padStart(2, "0")
    );
}

function matchMessageInputToComments() {
    // 狭い画面では入力欄と投稿一覧の高さを連動させない。
    if (window.matchMedia("(max-width: 999px)").matches) {
        message.style.minHeight = "";
        message.style.height = "";
        return;
    }

    message.style.minHeight = "";
    const inputStyles = getComputedStyle(message);
    const minimumMessageInputHeight = parseFloat(inputStyles.minHeight);

    // 直近投稿の先頭から末尾までを測り、入力欄の最低高を決める。
    const firstComment = recentMessagesContainer.firstElementChild;
    const lastComment = recentMessagesContainer.lastElementChild;
    if (!firstComment || !lastComment) {
        return;
    }

    const top = firstComment.getBoundingClientRect().top;
    const bottom = lastComment.getBoundingClientRect().bottom;
    const inputHeight = Math.max(
        bottom - top,
        minimumMessageInputHeight
    );
    message.style.minHeight = inputHeight + "px";
    message.style.height = inputHeight + "px";
    // 算出したサイズは次回ページ表示時のレイアウト予約にも利用する。
    saveMessageLayoutSize();
}

// ウィンドウ幅や投稿領域の高さが変わったら、入力欄の高さを再計算する。
window.addEventListener("resize", matchMessageInputToComments);
const commentSizeObserver = new ResizeObserver(matchMessageInputToComments);
commentSizeObserver.observe(recentMessagesContainer);
commentSizeObserver.observe(olderMessagesContainer);
matchMessageInputToComments();

function createMessageElement(row) {
    // 1件のDBレコードを、本文・投稿日時を持つチャット要素に変換する。
    const messageElement = document.createElement("div");
    messageElement.className = "chat-message";
    messageElement.classList.toggle("admin-post", row.is_admin);

    const dateElement = document.createElement("span");
    dateElement.className = "chat-message-date";

    const contentElement = document.createElement("div");
    contentElement.className = "chat-message-content";
    // 先頭に付く旧形式の匿名IDと区切り文字は表示から取り除く。
    const content = row.message.replace(
        /^([A-Za-z0-9]{8}|[A-Za-z0-9]{10}): /,
        ""
    );
    appendMessageContent(contentElement, content);
    if (row.is_admin) {
        // 管理者投稿には日時の前に識別用のマークを追加する。
        const adminLabel = document.createElement("span");
        adminLabel.className = "chat-message-admin";
        adminLabel.textContent = "🌎";
        dateElement.append(adminLabel, " ");
    }
    dateElement.append(formatMessageDate(row));

    messageElement.append(contentElement, dateElement);

    return messageElement;
}

function countMessageLines(messageElement) {
    // 折り返しを含む実際の表示行数をDOMの矩形から数える。
    const content = messageElement.querySelector(".chat-message-content");
    const contentRange = document.createRange();
    contentRange.selectNodeContents(content);
    const contentRects = Array.from(contentRange.getClientRects())
        .filter(function (rect) {
            return rect.height > 0 && rect.width > 0;
        })
        .sort(function (first, second) {
            return first.top - second.top;
        });

    const contentLineTops = [];
    contentRects.forEach(function (rect) {
        // 同じ表示行に属する矩形をまとめ、行頭位置を一度だけ記録する。
        if (!contentLineTops.some(function (top) {
            return Math.abs(top - rect.top) < 1;
        })) {
            contentLineTops.push(rect.top);
        }
    });

    const date = messageElement.querySelector(".chat-message-date");
    const dateRange = document.createRange();
    dateRange.selectNodeContents(date);
    const dateRects = Array.from(dateRange.getClientRects())
        .filter(function (rect) {
            return rect.height > 0 && rect.width > 0;
        });
    const dateHasSeparateLine = dateRects.length > 0 && !dateRects.some(
        function (dateRect) {
            return contentRects.some(function (contentRect) {
                return (
                    dateRect.top < contentRect.bottom &&
                    dateRect.bottom > contentRect.top
                );
            });
        }
    );

    // 本文が空でも最低1行として扱い、日時が別行ならその分を加算する。
    return Math.max(
        1,
        contentLineTops.length + (dateHasSeparateLine ? 1 : 0)
    );
}

function appendMessageContent(container, text) {
    // 本文をHTMLとして扱わず、HTTP(S) URLだけをリンク化する。
    const urlPattern = /https?:\/\/[^\s<>"']+/gi;
    // URL末尾に句読点が続いていても、リンクに含めず本文側に残す。
    const trailingPunctuationPattern = /[.,!?;:)\]}、。，．！？；：」』】）]+$/;
    let currentIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
        const matchedUrl = match[0];
        const url = matchedUrl.replace(trailingPunctuationPattern, "");
        const punctuation = matchedUrl.slice(url.length);
        const startIndex = match.index;

        // URLより前の文字列は通常のテキストノードとして追加する。
        container.appendChild(
            document.createTextNode(text.slice(currentIndex, startIndex))
        );

        let parsedUrl;
        try {
            // URLとして解釈できない文字列はリンクにせず、そのまま表示する。
            parsedUrl = new URL(url);
        } catch {
            container.appendChild(document.createTextNode(url));
            if (punctuation) {
                container.appendChild(document.createTextNode(punctuation));
            }
            currentIndex = startIndex + matchedUrl.length;
            continue;
        }

        // 外部リンクは別タブで開き、元ページへの操作を切り離す。
        const link = document.createElement("a");
        link.href = parsedUrl.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        container.appendChild(link);

        if (punctuation) {
            container.appendChild(document.createTextNode(punctuation));
        }
        currentIndex = startIndex + matchedUrl.length;
    }

    // 最後のURLより後ろに残ったテキストも欠かさず追加する。
    container.appendChild(document.createTextNode(text.slice(currentIndex)));
}

async function loadMessage() {
    // 新しい読込要求に番号を割り当て、後から完了した古い要求を識別する。
    const loadVersion = ++messageLoadVersion;
    // 画面外で組み立てて一括反映し、読込途中の表示崩れを防ぐ。
    const stagedRecentMessages = document.createElement("div");
    const stagedOlderMessages = document.createElement("div");
    stagedRecentMessages.className = "chat-recent-messages";
    stagedOlderMessages.className = "chat-older-messages";
    stagedRecentMessages.style.position = "fixed";
    stagedRecentMessages.style.left = "-10000px";
    stagedRecentMessages.style.top = "0";
    stagedRecentMessages.style.width =
        recentMessagesContainer.getBoundingClientRect().width + "px";
    stagedRecentMessages.style.visibility = "hidden";
    document.body.appendChild(stagedRecentMessages);

    // 表示候補の行数、DBページ位置、過去分との境界を順次記録する。
    let lineCount = 0;
    let cursorId = null;
    let splitMetadata = [];
    let hasMoreMessages = true;
    let stagedOldestRecentMessageId = null;
    let restoreToBottom = false;

    try {
        // 直近表示の行数に届くまで、新しい投稿から順に必要分だけ取得する。
        while (hasMoreMessages && splitMetadata.length === 0) {
            let query = supabaseClient
                .from("message")
                .select("*")
                .order("id", { ascending: false })
                .limit(olderMessageChunkSize);
            if (cursorId !== null) {
                query = query.lt("id", cursorId);
            }

            const { data, error } = await query;
            if (error) {
                // 取得に失敗した場合は既存の表示を置き換えない。
                console.error(error);
                return;
            }

            hasMoreMessages = data.length === olderMessageChunkSize;
            if (data.length === 0) {
                break;
            }

            cursorId = data[data.length - 1].id;
            for (let index = 0; index < data.length; index += 1) {
                const row = data[index];
                const messageElement = createMessageElement(row);
                stagedRecentMessages.appendChild(messageElement);
                const messageLines = countMessageLines(messageElement);

                if (
                    lineCount + messageLines > recentMessageLineLimit &&
                    lineCount > 0
                ) {
                    // 上限を超える最初の投稿から過去グループ側に分ける。
                    messageElement.remove();
                    splitMetadata = data.slice(index).map(function (entry) {
                        return { id: entry.id, created_at: entry.created_at };
                    });
                    break;
                }

                lineCount += messageLines;
                stagedOldestRecentMessageId = row.id;
            }
        }

        if (splitMetadata.length > 0) {
            // 境界より古い投稿は軽量なID・日時だけを取得して分類する。
            let metadataCursorId = cursorId;
            while (true) {
                const { data, error } = await supabaseClient
                    .from("message")
                    .select("id, created_at")
                    .lt("id", metadataCursorId)
                    .order("id", { ascending: false })
                    .limit(olderMessageFetchSize);

                if (error) {
                    console.error(error);
                    return;
                }

                splitMetadata.push(...data);
                if (data.length < olderMessageFetchSize) {
                    break;
                }
                metadataCursorId = data[data.length - 1].id;
            }

            for (
                let start = 0;
                start < splitMetadata.length;
                start += olderMessageChunkSize
            ) {
                // 過去投稿を一定件数ずつにまとめ、必要時まで本文を取得しない。
                createOlderMessageGroup(
                    splitMetadata.slice(start, start + olderMessageChunkSize),
                    stagedOlderMessages
                );
            }
        }

        if (loadVersion !== messageLoadVersion) {
            // より新しい読込処理が始まっていたら、この結果は反映しない。
            return;
        }

        // 読込開始前に最下部を見ていた場合だけ、反映後も最下部へ戻す。
        restoreToBottom =
            !suppressInitialScrollRestore &&
            window.scrollY + window.innerHeight >=
                document.documentElement.scrollHeight - 2;
        suppressInitialScrollRestore = false;
        recentMessagesContainer.replaceChildren(
            ...stagedRecentMessages.childNodes
        );
        olderMessagesContainer.replaceChildren(
            ...stagedOlderMessages.childNodes
        );
        oldestRecentMessageId = stagedOldestRecentMessageId;
        olderMessageGroupsLoaded = splitMetadata.length > 0;
        olderMessageGroupsLoading = false;
        matchMessageInputToComments();
    } finally {
        // 成功・失敗のどちらでも仮置き用の要素を片付ける。
        stagedRecentMessages.remove();
        if (loadVersion === messageLoadVersion) {
            // 最新の読込が完了したら予約レイアウトを解除し、確定サイズを保存する。
            document.body.classList.add("comments-ready");
            document.documentElement.style.removeProperty(
                "--message-layout-reserved-height"
            );
            document.documentElement.style.removeProperty(
                "--message-input-reserved-height"
            );
            document.body.classList.remove("message-layout-size-reserved");
            saveMessageLayoutSize();
            if (restoreToBottom) {
                // 読込前の閲覧位置が最下部だった時に限ってスクロールを維持する。
                window.scrollTo(
                    0,
                    document.documentElement.scrollHeight - window.innerHeight
                );
            }
        }
    }
}

function createOlderMessageGroup(metadata, container = olderMessagesContainer) {
    // 過去投稿を折りたたみ可能なまとまりとして作成する。
    const olderMessageGroup = document.createElement("details");
    olderMessageGroup.className = "chat-message-group";
    const groupTitle = document.createElement("summary");
    const dateRange = document.createElement("span");
    const groupContent = document.createElement("div");
    dateRange.className = "chat-message-group-date";
    dateRange.textContent = formatMessageDate(metadata[0]) + " ～";
    groupContent.className = "chat-message-group-content";
    groupTitle.appendChild(dateRange);
    olderMessageGroup.append(groupTitle, groupContent);

    const group = {
        details: olderMessageGroup,
        content: groupContent,
        metadata,
        messagesLoaded: false,
        loadingPromise: null
    };

    groupTitle.addEventListener("click", function (event) {
        // 展開時のブラウザー標準スクロールを止め、見出し位置を維持する。
        event.preventDefault();
        const titleTop = groupTitle.getBoundingClientRect().top;
        olderMessageGroup.open = !olderMessageGroup.open;

        requestAnimationFrame(function () {
            const topDifference =
                groupTitle.getBoundingClientRect().top - titleTop;
            window.scrollBy(0, topDifference);
        });

        if (olderMessageGroup.open && !group.messagesLoaded) {
            // 初回展開時だけ、該当グループの本文をサーバーから取得する。
            ensureOlderMessageGroupLoaded(group);
        }
    });

    container.appendChild(olderMessageGroup);
}

async function ensureOlderMessageGroupLoaded(group) {
    // 取得済みなら通信せず、そのまま表示済みの内容を使う。
    if (group.messagesLoaded) {
        return;
    }
    if (!group.loadingPromise) {
        // 同じグループへの重複取得を防ぐため、進行中のPromiseを共有する。
        group.loadingPromise = loadOlderMessageGroup(
            group.content,
            group.metadata,
            function () {
                group.messagesLoaded = true;
            },
            function () { }
        ).finally(function () {
            group.loadingPromise = null;
        });
    }
    await group.loadingPromise;
}

async function loadOlderMessageGroup(
    content,
    metadata,
    setLoaded,
    setLoading
) {
    // グループ内の古い投稿本文をIDの範囲で限定して読み込む。
    setLoading(true);
    content.replaceChildren();

    const { data, error } = await supabaseClient
        .from("message")
        .select("*")
        .lte("id", metadata[0].id)
        .gte("id", metadata[metadata.length - 1].id)
        .order("id", { ascending: false })
        .limit(olderMessageChunkSize);

    if (error) {
        // 失敗をコンソールに記録し、グループ内にも状態を明示する。
        console.error(error);
        const status = document.createElement("p");
        status.className = "chat-message-group-status";
        status.textContent =
            "読み込みに失敗しました。";
        content.appendChild(status);
        setLoading(false);
        return;
    }

    content.replaceChildren();
    // DBから返った新しい順を保ってDOMに追加し、次回取得を不要にする。
    data.forEach(function (row) {
        content.appendChild(createMessageElement(row));
    });
    setLoaded(true);
    setLoading(false);
}

async function loadOlderMessageGroups() {
    // 重複取得、完了後の再取得、境界未確定の状態では何もしない。
    if (
        olderMessageGroupsLoading ||
        olderMessageGroupsLoaded ||
        oldestRecentMessageId === null
    ) {
        return;
    }

    olderMessageGroupsLoading = true;
    const allOlderMetadata = [];
    let cursorId = oldestRecentMessageId;

    // 過去分はIDと日時だけ先に取得し、本文はグループを開いた時に読む。
    while (true) {
        const { data, error } = await supabaseClient
            .from("message")
            .select("id, created_at")
            .lt("id", cursorId)
            .order("id", { ascending: false })
            .limit(olderMessageFetchSize);

        if (error) {
            // メタデータ取得に失敗したら状態表示を残して再試行可能に戻す。
            console.error(error);
            const status = document.createElement("p");
            status.className = "chat-message-group-status";
            status.textContent = "読み込みに失敗しました。";
            olderMessagesContainer.appendChild(status);
            olderMessageGroupsLoading = false;
            return;
        }

        allOlderMetadata.push(...data);
        if (data.length < olderMessageFetchSize) {
            break;
        }
        cursorId = data[data.length - 1].id;
    }

    // すべてのID・日時を一定件数に区切り、展開可能なグループを追加する。
    for (
        let start = 0;
        start < allOlderMetadata.length;
        start += olderMessageChunkSize
    ) {
        const metadata = allOlderMetadata.slice(
            start,
            start + olderMessageChunkSize
        );
        createOlderMessageGroup(metadata);
    }
    olderMessageGroupsLoaded = true;
    olderMessageGroupsLoading = false;
}

async function sendMessage() {
    // 入力された本文を取得し、空文字だけの投稿は送信しない。
    const text = message.value;

    if (text === "") {
        return;
    }

    // 投稿時点の管理者状態をレコードに保存する。
    const isAdmin = window.isAdminMode();

    const { error } = await supabaseClient
        .from("message")
        .insert({
            message: text,
            is_admin: isAdmin
        });

    if (error) {
        // 保存失敗時は入力内容を消さず、開発者コンソールに理由を残す。
        console.error(error);
        return;
    }

    message.value = "";
    // 投稿成功後に入力欄を空にし、一覧をサーバーの最新状態で読み直す。
    matchMessageInputToComments();
    loadMessage();
}

message.addEventListener("input", function () {
    // 管理者は複数行を利用できるが、一般投稿は改行を禁止する。
    if (window.isAdminMode() || !/[\r\n]/.test(message.value)) {
        return;
    }

    // 改行削除前後でカーソルと選択範囲がずれないよう位置を補正する。
    const start = message.selectionStart;
    const end = message.selectionEnd;
    const valueBeforeStart = message.value.slice(0, start);
    const valueBeforeEnd = message.value.slice(0, end);
    message.value = message.value.replace(/[\r\n]/g, "");
    message.setSelectionRange(
        valueBeforeStart.replace(/[\r\n]/g, "").length,
        valueBeforeEnd.replace(/[\r\n]/g, "").length
    );
});

message.addEventListener("keydown", function (event) {
    // Enter操作はIME変換確定のEnterと区別してから処理する。
    const isAdmin = window.isAdminMode();
    if (event.key !== "Enter" || event.isComposing) {
        return;
    }

    const command = message.value.trim();
    if (command === "admin" || command === "admin off") {
        // 専用コマンドで管理者モードを切り替え、コマンド自体は投稿しない。
        event.preventDefault();
        window.setAdminMode(command === "admin");
        message.value = "";
        matchMessageInputToComments();
        return;
    }

    if (!isAdmin) {
        // 一般ユーザーはEnterで送信し、修飾キー付きEnterでは送信しない。
        event.preventDefault();
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }
        sendMessage();
        return;
    }

    // 管理者はShiftまたはCtrlを併用したEnterで複数行入力と送信を切り替える。
    if (event.shiftKey || event.ctrlKey) {
        event.preventDefault();
        sendMessage();
    }
});

document.getElementById("send").addEventListener("click", function () {
    // 送信ボタンからも、Enter送信と同じ関数を実行する。
    sendMessage();
});

// 新規投稿の通知を受けたら、直近表示と過去グループをまとめて再読込する。
supabaseClient
    .channel("message-changes")
    .on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "message"
        },
        function () {
            loadMessage();
        }
    )
    .subscribe();

// 初回表示時にDBから投稿を取得してチャットを描画する。
loadMessage();
