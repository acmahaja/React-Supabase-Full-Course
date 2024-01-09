// initalizing Supabase Client
const { createClient } = supabase;
const supaUrl = "https://tt.supabase.co";
const supaAnonKey =
  "ey...";

const supaClient = createClient(supaUrl, supaAnonKey);

// html elements
const loginButton = document.getElementById("signInBtn");
const logoutButton = document.getElementById("signOutBtn");
const whenSignedIn = document.getElementById("whenSignedIn");
const whenSignedOut = document.getElementById("whenSignedOut");
const userDetails = document.getElementById("userDetails");
const myThingsSection = document.getElementById("myThings");
const myThingsList = document.getElementById("myThingsList");
const allThingsSection = document.getElementById("allThings");
const allThingsList = document.getElementById("allThingsList");
const createThing = document.getElementById("createThing");

// Event Listeners

loginButton.addEventListener("click", () => {
  supaClient.auth.signInWithOAuth({
    provider: "google",
  });
});

logoutButton.addEventListener("click", () => {
  supaClient.auth.signOut();
});

createThing.addEventListener("click", async () => {
  const {
    data: { user },
  } = await supaClient.auth.getUser();
  const thing = createRandomThing(user);
  await supaClient.from("things").insert([thing]);
});

// init
const allThings = {};
checkUserOnStartUp();
let myThingsSubscription = null;
const myThings = {};
getAllInitialThings().then(() => listenToAllThings());

// We will use the onAuthStateChange method for updating the display, we pass a callback where we pass the session param which will show if the user is logged in
supaClient.auth.onAuthStateChange((_event, session) => {
  // we add optional chaining so that an undefined will be thrown and not an error
  if (session?.user) {
    adjustForUser(session.user);
  } else {
    adjustForNoUser();
  }
});

// function declerations

// check if the user is logged in
async function checkUserOnStartUp() {
  // destruct the token object to get the user
  const {
    data: { user },
    // get logged in user token
  } = await supaClient.auth.getUser();

  if (user) {
    // if there is a user login, adjust accordingly
    adjustForUser(user);
  } else {
    // if there is no user login, adjust accordingly
    adjustForNoUser(user);
  }
}

// Function to change UI elements if there is a user logged in
async function adjustForUser(user) {
  whenSignedIn.hidden = false;
  whenSignedOut.hidden = true;
  myThingsSection.hidden = false;
  // Going to use dynamic templating to render user information
  userDetails.innerHTML = `
    <h3>Hi ${user.user_metadata.full_name}</h3>
    <img src="${user.user_metadata.avatar_url}" />
    <p>UID: ${user.id}</p>
    `;
  await getMyInitialThings(user);
  listenToMyThingsChanges(user);
}

// Function to change UI elements if there is no user logged in
function adjustForNoUser() {
  whenSignedIn.hidden = true;
  whenSignedOut.hidden = false;
  myThingsSection.hidden = true;

  if (myThingsSubscription) {
    myThingsSubscription.unsubscribe();
    myThingsSubscription = null;
  }
}

// Get all data entries from server
async function getAllInitialThings() {
  // we destructure and store all the data objects from the supabase database
  const { data } =
    // we query the "things" database using the supaClient and use the select method to retrieve all entries
    await supaClient.from("things").select();

  for (const thing of data) {
    allThings[thing.id] = thing;
  }

  renderAllThings();
}

// used to render all things that have been recieved from server
function renderAllThings() {
  const tableHeader = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Weight</th>
            </tr>
        </thead>
    `;

  const tableBody = Object.values(allThings)
    .sort((a, b) => (a.weight > b.weight ? -1 : 1))
    .map((thing) => {
      return `
            <tr>
                <td>${thing.name}</td>
                <td>${thing.weight} lbs.</td>
            </tr>`;
    })
    .join("");

  const table = `
        <table class="table table-striped">
            ${tableHeader}
            <tbody>${tableBody}</tbody>
        </table>
    `;

  allThingsList.innerHTML = table;
}

// function to thar creates a random entry to a database if a user is logged in
function createRandomThing(user) {
  if (!user) {
    console.error("Must be signed in to create a thing");
    return;
  }

  return {
    name: faker.commerce.productName(3),
    weight: Math.round(Math.random() * 100),
    owner: user.id,
  };
}

function handleAllThingsUpdate(update) {
  if (update.eventType === "DELETE") {
    delete allThings[update.old.id];
  } else {
    allThings[update.new.id] = update.new;
  }

  renderAllThings();
}

function listenToAllThings() {
  supaClient
    .channel(`public:things`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "things" },
      handleAllThingsUpdate
    )
    .subscribe();
}

async function getMyInitialThings(user) {
  const { data } = await supaClient
    .from("things")
    .select("*")
    .eq("owner", user.id);

  for (const thing of data) {
    myThings[thing.id] = thing;
  }

  renderMyThings();
}

function handleMyThingsUpdate(update) {
  console.log("handling update");
  if (update.eventType === "DELETE") {
    delete myThings[update.old.id];
  } else {
    myThings[update.new.id] = update.new;
  }
  renderMyThings();
}

// Listens for changes to the user's things and subscribes to updates
async function listenToMyThingsChanges(user) {
  // Check if there's already an existing subscription, return if true
  if (myThingsSubscription) {
    return;
  }

  // Set up a subscription to listen for changes to the 'things' table
  myThingsSubscription = supaClient
    .channel(`public:things:owner=eq.${user.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "things",
        filter: `owner=eq.${user.id}`,
      },
      handleMyThingsUpdate
    )
    .subscribe();
}

// Renders the user's things in a table format
function renderMyThings() {
  // HTML template for the table header
  const tableHeader = `
  <thead>
    <tr>
      <th>Name</th>
      <th>Weight</th>
      <th></th>
    </tr>
  </thead>`;

  // Generate HTML for each thing and sort by weight
  const tableContents = Object.values(myThings)
    .sort((a, b) => (a.weight > b.weight ? -1 : 1))
    .map((thing) => {
      console.log(thing);
      return `
  <tr>
    <td>${thing.name}</td>
    <td>${thing.weight} lbs.</td>
    <td>${deleteButtonTemplate(thing)}</td>
  </tr>`;
    })
    .join("");

  // Combine header and contents to create the table HTML
  const table = `
  <table class="table table-striped">
    ${tableHeader}
    <tbody>${tableContents}</tbody>
  </table>`;

  // Insert the table HTML into the specified DOM element
  myThingsList.innerHTML = table;
}

// Generates the delete button HTML for a thing
function deleteButtonTemplate(thing) {
  return `
  <button
    onclick="deleteAtId(${thing.id})"
    class="btn btn-outline-danger"
  >
      ${trashIcon}
  </button>`;
}

// Deletes a thing by its ID using the Supabase client
async function deleteAtId(id) {
  await supaClient.from("things").delete().eq("id", id);
}

// Trash icon emoji for delete buttons
const trashIcon = `🗑️`;