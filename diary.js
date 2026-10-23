// 日記機能。ページによって存在しない要素があるため、使用前に存在を確認する。

// 新規日記の入力部品(管理者モードの時だけ表示中の日記の枠に差し込む)
const diaryBody = document.createElement("textarea");
const diaryConfirmButton = document.createElement("button");
const diaryEditorStatus = document.createElement("span");
const diaryTitleInput = document.createElement("input");
diaryTitleInput.id = "diary-title";
diaryTitleInput.type = "text";
diaryTitleInput.setAttribute("aria-label", "日記の日付");
diaryBody.id = "diary-body";
diaryBody.rows = 1;
diaryBody.addEventListener("input", resizeDiaryBody);
diaryBody.setAttribute("aria-label", "日記本文");
diaryConfirmButton.id = "diary-confirm";
diaryConfirmButton.type = "button";
diaryConfirmButton.textContent = "確定";
diaryEditorStatus.id = "diary-editor-status";
diaryEditorStatus.setAttribute("aria-live", "polite");
// 送信中の二重実行を防ぐフラグ
let diarySaving = false;
// 「新しく日記を追加」で入力欄を開いている間だけtrue
let diaryEditing = false;
const diaryAddButton = document.getElementById("diary-add");
// 閲覧画面の要素（index.html）
const diaryList = document.getElementById("diary-list");
const diaryEntryNavigation = document.querySelector(".diary-entry-navigation");
// 前後の日記へ移動するボタン
const diaryNavigationButtons = document.querySelectorAll(
    "#diary-view [data-diary-direction]"
);
// 取得済みの日記（新しい順）
let diaryEntries = [];
// 生成済みDOMのキャッシュ（未生成はnull）
let diaryArticles = [];
// 現在表示中の日記の添字
let selectedDiaryIndex = 0;
// 縮小後の画像サイズ(px)とJPEG品質(0〜1)
const diaryImageWidth = 360;
const diaryImageHeight = 270;
const diaryImageQuality = 0.75;

// 日記タイトル(例: 2026/10/05 12:00:00)から画像ファイル名用の日付(例: 261005)を作る。
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

// images/YYMMDD-NN.jpg を読み込み、縮小画像の読込完了後に解決するPromiseを返す。
// JPGが存在しなければ null で解決する(=連番の終わり)。縮小に失敗したら reject する。
function loadDiaryImage(date, sequence) {
    return new Promise(function (resolve, reject) {
        const image = document.createElement("img");
        // 連番は2桁(01, 02, ...)
        const fileNumber = String(sequence).padStart(2, "0");

        image.alt = "";
        // 画面外でも即座に読み込む(縮小処理に必要なため)。
        image.loading = "eager";
        // 元画像の読込成功時: canvasで縮小し、縮小後の画像が読めてから表示用に返す。
        image.addEventListener("load", function handleSourceLoad() {
            image.removeEventListener("load", handleSourceLoad);
            try {
                const canvas = document.createElement("canvas");
                canvas.width = diaryImageWidth;
                canvas.height = diaryImageHeight;
                const context = canvas.getContext("2d");
                if (!context) {
                    throw new Error("Canvas 2D context is unavailable.");
                }

                // 画像全体を360x270に伸縮して描画する。
                context.drawImage(
                    image,
                    0,
                    0,
                    diaryImageWidth,
                    diaryImageHeight
                );
                const resizedImage = document.createElement("img");
                resizedImage.alt = "";
                resizedImage.loading = "eager";
                resizedImage.addEventListener("load", function () {
                    resolve(resizedImage);
                }, { once: true });
                resizedImage.addEventListener("error", function () {
                    reject(new Error("縮小後の日記画像を読み込めませんでした。"));
                }, { once: true });
                resizedImage.src = canvas.toDataURL(
                    "image/jpeg",
                    diaryImageQuality
                );
            } catch (error) {
                reject(error);
            }
        });
        // JPGが存在しない場合は、次の連番画像がないものとして扱う。
        image.addEventListener("error", function () {
            resolve(null);
        }, { once: true });
        image.src = `images/${date}-${fileNumber}.jpg`;
    });
}

// 日記画像(01, 02, ...)を順に探し、読み込み完了ごとに表示する。
async function appendDiaryImages(article, title) {
    // 日付が読めないタイトルでは何もしない。
    const date = getDiaryImageDate(title);
    if (!date) {
        return;
    }

    const imageList = document.createElement("div");
    imageList.className = "diary-entry-image-grid";
    const imageFrame = document.createElement("div");
    imageFrame.className = "diary-entry-images";
    imageFrame.appendChild(imageList);
    for (let sequence = 1; sequence <= 99; sequence += 1) {
        let image;
        try {
            image = await loadDiaryImage(date, sequence);
        } catch (error) {
            console.error("日記画像を縮小・圧縮できませんでした。", error);
            return;
        }
        if (!image) {
            return;
        }

        imageList.appendChild(image);
        // 最初の画像が準備できた時点で表示し、後続画像は準備でき次第追加する。
        if (!imageFrame.isConnected) {
            article.appendChild(imageFrame);
        }
    }
}

// 管理者モードかどうか。localStorage の "admin" を見る(comment.js からも利用される)。
window.isAdminMode = function () {
    return localStorage.getItem("admin") === "true";
};

// 管理者モードのON/OFFを保存して通知する(comment.js の admin コマンドから呼ばれる)。
window.setAdminMode = function (enabled) {
    if (enabled) {
        localStorage.setItem("admin", "true");
    } else {
        localStorage.removeItem("admin");
    }
    window.dispatchEvent(new Event("admin-mode-change"));
};

// 入力内容の行数に合わせて日記入力欄の高さを調整する。
function resizeDiaryBody() {
    diaryBody.style.height = "auto";
    diaryBody.style.height = diaryBody.scrollHeight + "px";
}

// 入力欄は、追加ボタンで開いている間だけ最新の日記の枠に差し込む。
function updateDiaryEditor() {
    const article = diaryList && diaryList.firstElementChild;
    if (!article) {
        return;
    }
    const content = article.querySelector(".diary-entry-content");
    const header = article.querySelector(".diary-entry-header");
    const dateLabel = article.querySelector(".diary-entry-date");
    const images = article.querySelector(".diary-entry-images");
    if (window.isAdminMode() && diaryEditing && selectedDiaryIndex === 0) {
        if (content.dataset.text === undefined) {
            content.dataset.text = content.textContent;
        }
        if (diaryTitleInput.value === "") {
            diaryTitleInput.value = formatDiaryTitleDate(new Date());
        }
        content.replaceChildren(diaryBody);
        resizeDiaryBody();
        if (images) {
            images.hidden = true;
        }
        dateLabel.hidden = true;
        header.prepend(diaryEditorStatus);
        header.append(diaryTitleInput);
    } else if (content.dataset.text !== undefined) {
        content.textContent = content.dataset.text;
        delete content.dataset.text;
        if (images) {
            images.hidden = false;
        }
        dateLabel.hidden = false;
        diaryEditorStatus.remove();
        diaryTitleInput.remove();
    }
}

// 確定ボタンは、入力欄を開いている間だけ追加ボタンのあった位置(日記の移動行の右端)に表示する。
function updateDiaryConfirmButton() {
    if (window.isAdminMode() && diaryEditing) {
        diaryEntryNavigation.append(diaryConfirmButton);
    } else {
        diaryConfirmButton.remove();
    }
}

// 追加ボタンは、管理者モードで最新の日記を見ていて入力欄が閉じている時だけ表示する。
function updateDiaryAddButton() {
    if (diaryAddButton) {
        diaryAddButton.hidden =
            !window.isAdminMode() || diaryEditing || selectedDiaryIndex !== 0;
    }
}

// 入力欄・確定ボタン・追加ボタンの表示をまとめて更新する。
function updateDiaryAdminUi() {
    if (!window.isAdminMode()) {
        diaryEditing = false;
    }
    updateDiaryEditor();
    updateDiaryConfirmButton();
    updateDiaryAddButton();
    updateDiaryNavigationButtons();
}

// 確定ボタン: 入力された本文を送信時点の日時をタイトルにして保存する。
async function submitDiary() {
    const content = diaryBody.value.trim();
    const title = diaryTitleInput.value.trim();
    if (diarySaving || !window.isAdminMode() || content === "" || title === "") {
        return;
    }

    diarySaving = true;
    diaryConfirmButton.disabled = true;
    const { error } = await supabaseClient
        .from("diary")
        .insert({ title, content });
    diarySaving = false;
    diaryConfirmButton.disabled = false;

    // 失敗時は本文を残して再送信できるようにする。
    if (error) {
        console.error(error);
        return;
    }

    diaryBody.value = "";
    resizeDiaryBody();
    diaryTitleInput.value = "";
    diaryEditing = false;
    await loadDiaries();
    diaryEditorStatus.textContent = "";
}

diaryConfirmButton.addEventListener("click", submitDiary);
if (diaryAddButton) {
    diaryAddButton.addEventListener("click", function () {
        diaryEditing = true;
        diaryTitleInput.value = formatDiaryTitleDate(new Date());
        diaryEditorStatus.textContent = "";
        updateDiaryAdminUi();
        diaryBody.focus();
    });
}
updateDiaryAdminUi();
window.addEventListener("admin-mode-change", updateDiaryAdminUi);
window.addEventListener("storage", function (event) {
    if (event.key === "admin") {
        updateDiaryAdminUi();
    }
});
// 日記タイトル(日付)を「2026/10/05 12:00:00」の形式で作る。
function formatDiaryTitleDate(date) {
    return (
        date.getFullYear() + "/" +
        String(date.getMonth() + 1).padStart(2, "0") + "/" +
        String(date.getDate()).padStart(2, "0") +
        " " +
        String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0") + ":" +
        String(date.getSeconds()).padStart(2, "0")
    );
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
    return article;
}

// 前後ボタンの移動先と表示を更新する。入力中は新しい日記が最新になるため、「前」は現在の最新日記を指す。
function updateDiaryNavigationButtons() {
    const index = diaryEditing ? -1 : selectedDiaryIndex;
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
            ? `◂ ${title}`
            : `${title} ▸`;
    });
}

// index番目の日記を表示し、前後ボタンを更新する。
function renderDiarySelection(index) {
    // 範囲外・数値でない添字は無視する。
    if (!Number.isInteger(index) || index < 0 || index >= diaryEntries.length) {
        return;
    }

    // 別の日記へ移る時は入力欄を閉じ、元の本文表示に戻してから切り替える。
    if (diaryEditing) {
        diaryEditing = false;
        updateDiaryEditor();
        updateDiaryConfirmButton();
    }
    selectedDiaryIndex = index;
    // 画像の探索を待たずに本文を先に表示する。
    if (!diaryArticles[index]) {
        const entry = diaryEntries[index];
        diaryArticles[index] = createDiaryEntry(entry);
        appendDiaryImages(diaryArticles[index], entry.title).catch(function (error) {
            console.error("日記画像を読み込めませんでした。", error);
        });
    }

    // 配列は新しい順なので、「前」は添字+1、「次」は添字-1。移動先がなければボタンを隠し、あれば移動先の日付を表示する。
    updateDiaryNavigationButtons();
    diaryList.replaceChildren(diaryArticles[index]);
    updateDiaryAdminUi();
}

// 日記がない・読み込めない場合に、前後ボタンを隠す。
function hideDiaryNavigation() {
    diaryNavigationButtons.forEach(function (button) {
        button.closest(".diary-entry-navigation").hidden = true;
    });
}

// 日記を新しい順に全件取得し、最新の日記を表示する。
async function loadDiaries() {
    // 閲覧用の要素がないページでは何もしない。
    if (!diaryList) {
        return;
    }

    const { data, error } = await supabaseClient
        .from("diary")
        .select("title, content")
        .order("id", { ascending: false });

    if (error) {
        console.error(error);
        hideDiaryNavigation();
        return;
    }
    diaryEntries = data;
    // 表示キャッシュを日記の件数分だけ空(null)で用意する。
    diaryArticles = data.map(function () {
        return null;
    });

    // 日記があれば最新(先頭)を表示し、日記がない場合は前後ボタンを隠す。
    if (diaryEntries.length > 0) {
        renderDiarySelection(0);
        diaryEntryNavigation.hidden = false;
    } else {
        hideDiaryNavigation();
    }
}

// 前へ/次へボタン: 新しい順の配列で前=+1、次=-1 だけ添字を動かして表示する。
diaryNavigationButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        const indexOffset = button.dataset.diaryDirection === "previous" ? 1 : -1;
        // 入力中の「前」は現在の最新日記(添字0)へ移る。
        const baseIndex = diaryEditing ? -1 : selectedDiaryIndex;
        renderDiarySelection(baseIndex + indexOffset);
    });
});

// ページ読み込み時に日記を取得して表示する。
loadDiaries().finally(function () {
    window.markPageSectionReady("diary");
});
