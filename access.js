const supabaseUrl = "https://wqhcznhalhpsxchkdauz.supabase.co";
const supabaseKey = "sb_publishable_MJMHNXpq8mx3WJ1TH5uuxw_PCMUiamL";

const accessSupabase = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);

async function loadAccessCount() {

    const { data, error } =
        await accessSupabase.rpc("increment_access_count");

    if (error) {
        console.error(error);
        return;
    }

    document.getElementById("counter").textContent = data;
}

loadAccessCount();
