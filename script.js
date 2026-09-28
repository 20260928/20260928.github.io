const supabaseUrl = "https://wqhcznhalhpsxchkdauz.supabase.co";
const supabaseKey = "sb_publishable_MJMHNXpq8mx3WJ1TH5uuxw_PCMUiamL";

const supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);


const message = document.getElementById("message");
const chat = document.getElementById("chat");


// このブラウザ専用のID
let deviceId = localStorage.getItem("device_id");

if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("device_id", deviceId);
}


// 投稿を読み込む
async function loadMessages() {

    const { data, error } = await supabaseClient
        .from("messages")
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
        .from("messages")
        .insert({
            message: text,
            device_id: deviceId,
            is_admin: isAdmin
        });

    if (error) {
        console.error(error);
        return;
    }

    message.value = "";

    loadMessages();
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
loadMessages();
