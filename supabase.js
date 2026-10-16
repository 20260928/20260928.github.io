// Supabase接続設定。コメントと日記で同じクライアントを使う。
// 接続先プロジェクトのURL
const supabaseUrl = "https://wqhcznhalhpsxchkdauz.supabase.co";
// ブラウザ公開用キー。アクセス制限はSupabase側のRLSで行う。
const supabaseKey = "sb_publishable_MJMHNXpq8mx3WJ1TH5uuxw_PCMUiamL";

// CDNから読み込んだsupabase-jsでクライアントを作成する。
// diary.jsとcomment.jsからsupabaseClientとして参照する。
const supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);
