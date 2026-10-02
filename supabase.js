const supabaseUrl = "https://wqhcznhalhpsxchkdauz.supabase.co";
const supabaseKey = "sb_publishable_MJMHNXpq8mx3WJ1TH5uuxw_PCMUiamL";

const supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);


const message = document.getElementById("message");
const chat = document.getElementById("chat");


// 投稿を読み込む
async function loadMessage() {

    const { data, error } = await supabaseClient
        .from("message")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    chat.innerHTML = "";

    data.forEach(function(row) {

        const date = new Date(row.created_at);

        const dateText =
            date.getFullYear() + "/" +
            (date.getMonth() + 1) + "/" +
            date.getDate() + " " +
            String(date.getHours()).padStart(2, "0") + ":" +
            String(date.getMinutes()).padStart(2, "0");

        chat.innerHTML +=
            "<p>" +
            "<span>" + dateText + "</span> " +
            (row.is_admin ? "★ " : "") +
            row.message +
            "</p>";
    });
}


// 投稿する
async function sendMessage() {

    const text = message.value;

    if (text === "") {
        return;
    }


    // 自分の端末として登録
    if (text === "/admin 1234") {

        localStorage.setItem("admin", "true");

        message.value = "";

        return;
    }


    // 自分の端末としての登録を解除
    if (text === "/admin off") {

        localStorage.removeItem("admin");

        message.value = "";

        return;
    }


    const isAdmin =
        localStorage.getItem("admin") === "true";


    const { error } = await supabaseClient
        .from("message")
        .insert({
            message: text,
            is_admin: isAdmin
        });

    if (error) {
        console.error(error);
        return;
    }

    message.value = "";

    loadMessage();
}


// Enterキー
message.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        sendMessage();
    }

});


// Enterボタン
document.getElementById("send").addEventListener("click", function() {

    sendMessage();

});


// 最初に投稿を読み込む
loadMessage();

// 新しい投稿をリアルタイムで受け取る
supabaseClient
    .channel("message-changes")
    .on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "message"
        },
        function(payload) {
            console.log("新しい投稿を受信:", payload);
            loadMessage();
        }
    )
    .subscribe(function(status) {
        console.log("Realtime:", status);
    });
// アクセスカウンター
async function loadAccessCount() {

    const lastAccess = localStorage.getItem("lastAccess");
    const savedCount = localStorage.getItem("savedCount");
    const now = Date.now();

    if (
        lastAccess &&
        savedCount &&
        now - Number(lastAccess) < 10 * 60 * 1000
    ) {
        document.getElementById("counter").textContent =
            String(savedCount).padStart(6, "0");

        return;
    }

    const { data, error } =
        await supabaseClient.rpc("increment_access_count");

    if (error) {
        console.error(error);
        return;
    }

    document.getElementById("counter").textContent =
        String(data).padStart(6, "0");

    localStorage.setItem("lastAccess", now);
    localStorage.setItem("savedCount", data);
}

loadAccessCount();
