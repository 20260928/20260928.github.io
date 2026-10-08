// Supabase(データベース)の接続設定ファイル。
// コメント投稿(message)と日記(diary)の両方がここで作るクライアントを共有する。
// 接続先プロジェクトのURL。
const supabaseUrl = "https://wqhcznhalhpsxchkdauz.supabase.co";
// ブラウザ公開用(publishable)キー。公開前提のキーで、実際のアクセス制限はSupabase側のRLSで行う。
const supabaseKey = "sb_publishable_MJMHNXpq8mx3WJ1TH5uuxw_PCMUiamL";

// HTML側で先に読み込んだ supabase-js(CDN)の createClient でクライアントを作成する。
// 他のJS(diary.js / comments.js)からは supabaseClient として参照する。
const supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);
