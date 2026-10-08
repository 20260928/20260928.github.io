// 日記機能のスクリプト。index.html(管理者の日記投稿)と diary.html(日記の閲覧)の両方で読み込まれる。
// ページごとに存在しない要素は null になるため、使う前に存在確認をしている。

// --- 投稿欄まわりの要素(index.html のみに存在) ---
const diaryBodyInput = document.getElementById("message");
const adminDiaryControls = document.getElementById("admin-diary-controls");
const diaryTitle = document.getElementById("diary-title");
const diarySendButton = document.getElementById("diary-send");
const diaryConfirmQuestion = document.getElementById("diary-confirm-question");
const diaryConfirmYes = document.getElementById("diary-confirm-yes");
const diaryConfirmNo = document.getElementById("diary-confirm-no");
const sendButton = document.getElementById("send");
const diaryStatus = document.getElementById("diary-status");
// --- 閲覧まわりの要素(diary.html のみに存在) ---
const diaryList = document.getElementById("diary-list");
const diaryLoadStatus = document.getElementById("diary-load-status");
const diaryDateList = document.getElementById("diary-date-list");
const diaryEntryNavigation = document.querySelector(".diary-entry-navigation");
// 「前の日記」「次の日記」ボタン
const diaryNavigationButtons = document.querySelectorAll(
    "#diary-view [data-diary-direction]"
);
// 二重送信防止フラグ
let diarySaving = false;
// 取得済みの日記データ(新しい順)
let diaryEntries = [];
// 生成済みの日記DOMのキャッシュ(未生成はnull)。再表示のたびに画像を再読込しないため。
let diaryArticles = [];
// 現在表示中の日記の添字
let selectedDiaryIndex = 0;
// 日記画像の拡張子の候補。この順に試して最初に存在したものを使う。
const diaryImageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "avif"];
// 縮小後の画像サイズ(px)とJPEG品質(0〜1)
const diaryImageWidth = 360;
const diaryImageHeight = 270;
const diaryImageQuality = 0.75;

// 日記タイトル(例: 2026/10/05(月) 12:00:00)から画像ファイル名用の日付(例: 261005)を作る。
// 日付として読めないタイトルは null を返し、画像なし扱いにする。
function getDiaryImageDate(title) {
    // タイトルの日付を画像ファイル名用のYYMMDD形式にする。
    const dateTitle = title.split("|", 1)[0];
    const match = dateTitle.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) {
        return null;
    }

    const [, year, month, day] = match;
    return year.slice(-2) + month.padStart(2, "0") + day.padStart(2, "0");
}

// images/YYMMDD-NN.拡張子 の画像を1枚読み込み、縮小したimg要素で解決するPromiseを返す。
// どの拡張子でも存在しなければ null で解決する(=連番の終わり)。縮小に失敗したら reject する。
function loadDiaryImage(date, sequence) {
    return new Promise(function (resolve, reject) {
        const image = document.createElement("img");
        // 連番は2桁(01, 02, ...)
        const fileNumber = String(sequence).padStart(2, "0");
        let extensionIndex = 0;

        // 読込エラーのたびに呼ばれ、次の拡張子で同じ画像を探し直す。
        function tryNextExtension() {
            // 全拡張子が見つからなかった場合は画像なし。
            if (extensionIndex >= diaryImageExtensions.length) {
                resolve(null);
                return;
            }

            const extension = diaryImageExtensions[extensionIndex];
            extensionIndex += 1;
            image.src = `images/${date}-${fileNumber}.${extension}`;
        }

        image.alt = "";
        // 画面外でも即座に読み込む(縮小処理に必要なため)。
        image.loading = "eager";
        // 読込成功時: これ以上の拡張子探索を止め、canvasで縮小してdata URLに置き換える。
        image.addEventListener("load", function () {
            image.removeEventListener("error", tryNextExtension);
            try {
                const canvas = document.createElement("canvas");
                canvas.width = diaryImageWidth;
                canvas.height = diaryImageHeight;
                const context = canvas.getContext("2d");
                if (!context) {
                    throw new Error("Canvas 2D context is unavailable.");
                }

                // 一覧用画像を縮小・圧縮し、描画負荷を抑える。
                context.drawImage(
                    image,
                    0,
                    0,
                    diaryImageWidth,
                    diaryImageHeight
                );
                image.src = canvas.toDataURL(
                    "image/jpeg",
                    diaryImageQuality
                );
                resolve(image);
            } catch (error) {
                reject(error);
            }
        }, { once: true });
        // 読込失敗(ファイルなし)時は次の拡張子を試す。最初の1回は手動で開始する。
        image.addEventListener("error", tryNextExtension);
        tryNextExtension();
    });
}

// 日記1件に対応する画像(01, 02, ...)を順に探して、見つかった分をarticleの下に表示する。
async function appendDiaryImages(article, title) {
    // 日付が読めないタイトルでは何もしない。
    const date = getDiaryImageDate(title);
    if (!date) {
        return;
    }

    const imageList = document.createElement("div");
    imageList.className = "diary-entry-image-grid";
    // 画像は連番で保存されるため、最初の欠番で検索を終える。
    for (let sequence = 1; sequence <= 99; sequence += 1) {
        let image;
        try {
            image = await loadDiaryImage(date, sequence);
        } catch (error) {
            console.error("日記画像を縮小・圧縮できませんでした。", error);
            const status = document.createElement("p");
            status.className = "diary-image-error";
            status.textContent = "画像を表示できませんでした。";
            article.appendChild(status);
            return;
        }
        if (!image) {
            break;
        }

        imageList.appendChild(image);
    }
    // 1枚以上見つかった場合だけ画像枠を表示する。
    if (imageList.childElementCount > 0) {
        const imageFrame = document.createElement("div");
        imageFrame.className = "diary-entry-images";
        imageFrame.appendChild(imageList);
        article.appendChild(imageFrame);
    }
}

// 管理者モードかどうか。localStorage の "admin" を見る(comments.js からも利用される)。
window.isAdminMode = function () {
    return localStorage.getItem("admin") === "true";
};

// 日記タイトルの初期値を「2026/10/05(月) 12:00:00」の形式で作る。
function formatDiaryTitleDate(date) {
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return (
        date.getFullYear() + "/" +
        String(date.getMonth() + 1).padStart(2, "0") + "/" +
        String(date.getDate()).padStart(2, "0") +
        "(" + weekdays[date.getDay()] + ") " +
        String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0") + ":" +
        String(date.getSeconds()).padStart(2, "0")
    );
}

// 日記送信の確認表示を切り替える。
// true: 「日記を送信しますか？」と はい/いいえ を表示し、通常のタイトル欄・日記/送信ボタンを隠す。
// false: 通常表示に戻す。
function setDiaryConfirmationVisible(visible) {
    diaryTitle.hidden = visible;
    diaryConfirmQuestion.hidden = !visible;
    diarySendButton.hidden = visible;
    diaryConfirmNo.hidden = !visible;
    sendButton.hidden = visible;
    diaryConfirmYes.hidden = !visible;
}

// 管理者モードの状態に合わせて日記投稿用コントロールの表示/非表示を更新する。
function updateDiaryControls() {
    // diary.html など、投稿欄のないページでは何もしない。
    if (!adminDiaryControls || !diaryBodyInput) {
        return;
    }
    adminDiaryControls.hidden = !window.isAdminMode();
    // 管理者でなくなった時は確認表示も残さない。
    if (adminDiaryControls.hidden) {
        setDiaryConfirmationVisible(false);
    }
}

// 管理者モードのON/OFFを保存して画面に反映する(comments.js の /admin コマンドから呼ばれる)。
window.setAdminMode = function (enabled) {
    if (enabled) {
        localStorage.setItem("admin", "true");
    } else {
        localStorage.removeItem("admin");
    }
    updateDiaryControls();
};

// 「日記」ボタン押下時: 本文があれば送信確認(はい/いいえ)を表示する。
function requestDiaryConfirmation() {
    if (!adminDiaryControls) {
        return;
    }
    // 管理者でない場合は投稿させず、表示を非管理者状態に戻す。
    if (!window.isAdminMode()) {
        updateDiaryControls();
        return;
    }

    // 本文が空なら確認を出さない。
    if (!diaryBodyInput.value.trim()) {
        return;
    }

    setDiaryConfirmationVisible(true);
}

// 確認で「はい」が押された時: 日記をSupabaseのdiaryテーブルへ保存する。
async function sendDiary() {
    setDiaryConfirmationVisible(false);
    // 保存中の二重送信と、非管理者による送信を防ぐ。
    if (diarySaving || !window.isAdminMode()) {
        return;
    }

    // タイトル欄の内容(日付)をそのままタイトルとして保存する。
    const date = diaryTitle.value.trim();
    const title = date;
    const content = diaryBodyInput.value.trim();

    // 保存中はボタンを無効化する。
    diarySaving = true;
    diarySendButton.disabled = true;

    const { error } = await supabaseClient
        .from("diary")
        .insert({ title, content });

    diarySaving = false;
    diarySendButton.disabled = false;
    // 失敗時は本文を残したままエラーを表示する(再送信できるように)。
    if (error) {
        console.error(error);
        diaryStatus.textContent = "日記を保存できませんでした。";
        return;
    }

    // 成功時は入力欄を空にして結果を表示する。
    diaryBodyInput.value = "";
    window.resizeMessageInput();
    diaryStatus.textContent = "日記を投稿しました。";
}

// 投稿欄があるページ(index.html)でのみ、初期値の設定とボタンの動作を登録する。
if (adminDiaryControls) {
    diaryTitle.value = formatDiaryTitleDate(new Date());
    updateDiaryControls();
    diarySendButton.addEventListener("click", requestDiaryConfirmation);
    diaryConfirmYes.addEventListener("click", sendDiary);
    diaryConfirmNo.addEventListener("click", function () {
        setDiaryConfirmationVisible(false);
    });
}

// 日記1件分の表示用article要素を作る(日付ヘッダー・本文・画像)。
function createDiaryEntry(entry) {
    const article = document.createElement("article");
    article.className = "diary-entry";
    // タイトルに「|」がある場合は、その前までを日付として表示する。
    const date = entry.title.split("|", 1)[0];
    const header = document.createElement("div");
    header.className = "diary-entry-header";
    const entryDate = document.createElement("span");
    entryDate.className = "diary-entry-date";
    entryDate.textContent = date;
    header.appendChild(entryDate);
    const content = document.createElement("div");
    content.className = "diary-entry-content";
    // 投稿本文をHTMLとして解釈させない。
    content.textContent = entry.content;
    article.append(header, content);
    // 画像は非同期で探し、見つかり次第あとからarticleに追加される。
    appendDiaryImages(article, date);
    return article;
}

// index番目の日記を表示し、前後ボタンと日付一覧の選択状態を更新する。
function renderDiarySelection(index) {
    // 範囲外・数値でない添字は無視する。
    if (!Number.isInteger(index) || index < 0 || index >= diaryEntries.length) {
        return;
    }

    selectedDiaryIndex = index;
    // 初めて表示する日記だけDOMを生成し、以降はキャッシュを使い回す。
    if (!diaryArticles[index]) {
        diaryArticles[index] = createDiaryEntry(diaryEntries[index]);
    }
    diaryList.replaceChildren(diaryArticles[index]);

    // 配列は新しい順なので、「前」は添字+1、「次」は添字-1。移動先がなければボタンを隠し、あれば移動先の日付を表示する。
    diaryNavigationButtons.forEach(function (button) {
        const direction = button.dataset.diaryDirection;
        const destinationIndex = direction === "previous" ? index + 1 : index - 1;
        const hasDestination = destinationIndex >= 0 &&
            destinationIndex < diaryEntries.length;
        const title = hasDestination
            ? diaryEntries[destinationIndex].title.split("|", 1)[0]
            : "";
        button.hidden = !hasDestination;
        button.textContent = direction === "previous"
            ? `◀ ${title}`
            : `${title} ▶`;
    });
    diaryEntryNavigation.classList.toggle(
        "diary-entry-navigation-latest",
        index === 0
    );
    diaryEntryNavigation.classList.toggle(
        "diary-entry-navigation-oldest",
        index === diaryEntries.length - 1
    );

    // 日付一覧のうち表示中の日記だけに aria-current を付ける(CSSで強調表示される)。
    diaryDateList.querySelectorAll("[data-diary-index]").forEach(function (button) {
        if (Number(button.dataset.diaryIndex) === index) {
            button.setAttribute("aria-current", "date");
        } else {
            button.removeAttribute("aria-current");
        }
    });
}

// 日記がない・読み込めない場合に、日付一覧と前後ボタンを隠す。
function hideDiaryNavigation() {
    const archive = document.getElementById("diary-archive");
    if (archive) {
        archive.hidden = true;
    }
    diaryNavigationButtons.forEach(function (button) {
        button.closest(".diary-entry-navigation").hidden = true;
    });
}

// 日記を新しい順に全件取得し、日付一覧を作って最新の日記を表示する(diary.html用)。
async function loadDiaries() {
    // 閲覧用の要素がないページ(index.html)では何もしない。
    if (!diaryList || !diaryLoadStatus || !diaryDateList) {
        return;
    }

    const { data, error } = await supabaseClient
        .from("diary")
        .select("title, content")
        .order("id", { ascending: false });

    if (error) {
        console.error(error);
        hideDiaryNavigation();
        diaryLoadStatus.textContent = "日記を読み込めませんでした。";
        return;
    }
    diaryEntries = data;
    // 表示キャッシュを日記の件数分だけ空(null)で用意する。
    diaryArticles = data.map(function () {
        return null;
    });
    diaryDateList.replaceChildren();

    // 日記ごとに日付ボタンを作る。data-diary-index で何番目の日記かを持たせる。
    diaryEntries.forEach(function (entry, index) {
        const item = document.createElement("li");
        const link = document.createElement("button");
        link.type = "button";
        link.className = "diary-date-link";
        link.dataset.diaryIndex = String(index);
        link.textContent = entry.title.split("|", 1)[0];
        item.appendChild(link);
        diaryDateList.appendChild(item);
    });

    // 日記があれば最新(先頭)を表示して前後ボタンを出し、なければ案内を表示する。
    if (diaryEntries.length > 0) {
        renderDiarySelection(0);
        diaryEntryNavigation.hidden = false;
    } else {
        hideDiaryNavigation();
    }
    diaryLoadStatus.textContent = data.length === 0 ? "日記はまだありません。" : "";
}

// 日付一覧のクリックは親で受け取り(イベント委譲)、押された日付の日記を表示する。
if (diaryDateList) {
    diaryDateList.addEventListener("click", function (event) {
        const link = event.target.closest("[data-diary-index]");
        if (link) {
            renderDiarySelection(Number(link.dataset.diaryIndex));
        }
    });
}

// 前へ/次へボタン: 新しい順の配列で前=+1、次=-1 だけ添字を動かして表示する。
diaryNavigationButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        const indexOffset = button.dataset.diaryDirection === "previous" ? 1 : -1;
        renderDiarySelection(selectedDiaryIndex + indexOffset);
    });
});

// ページ読み込み時に日記を取得して表示する。
loadDiaries();
