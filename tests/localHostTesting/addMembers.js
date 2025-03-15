document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const locationName = urlParams.get('location');
    const owner = urlParams.get('owner'); // Get the owner from the URL
    const membersList = document.getElementById('membersList');
    const searchResults = document.getElementById('searchResults').querySelector('ul');
    let members = [owner]; // Automatically add the owner to the members list
    let searchResultsCache = [];

    // Display the owner in the members list
    const ownerItem = document.createElement('li');
    ownerItem.textContent = owner;
    membersList.appendChild(ownerItem);

    // Search users as the user types
    function searchUsers() {
        const query = document.getElementById('memberName').value.trim().toLowerCase();
        if (query) {
            fetch(`/searchUsers?query=${query}`)
                .then(response => response.json())
                .then(users => {
                    searchResultsCache = users;
                    searchResults.innerHTML = '';
                    users.slice(0, 5).forEach(user => { // Limit to 5 results
                        if (user.toLowerCase().startsWith(query) && user !== owner && !members.includes(user)) { // Exclude the owner and already added members from search results
                            const item = document.createElement('li');
                            item.textContent = user;
                            item.onclick = () => selectUser(user);
                            searchResults.appendChild(item);
                        }
                    });
                    document.getElementById('searchResults').style.display = 'block';
                })
                .catch(error => {
                    console.error('Error:', error);
                });
        } else {
            searchResults.innerHTML = '';
            document.getElementById('searchResults').style.display = 'none';
        }
    }

    // Select a user from the search results
    function selectUser(user) {
        document.getElementById('memberName').value = user;
        searchResults.innerHTML = '';
        document.getElementById('searchResults').style.display = 'none';
    }

    // Add member to the local list and display it
    function addMember() {
        const memberName = document.getElementById('memberName').value.trim();
        if (memberName && searchResultsCache.includes(memberName) && !members.includes(memberName)) {
            members.push(memberName);
            const item = document.createElement('li');
            item.textContent = memberName;
            membersList.appendChild(item);
            document.getElementById('memberName').value = ''; // Clear input after adding
            document.getElementById('error-message').textContent = ''; // Clear error message
            searchUsers(); // Refresh search results
        } else {
            document.getElementById('error-message').textContent = 'Member not found or already added.';
        }
    }

    // Confirm members and send data to the server
    function confirmMembers() {
        if (!locationName) {
            alert('Please enter a location name.');
            return;
        }
        if (members.length > 0) {
            fetch('/createLocation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ locationName, members, owner })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => { throw new Error(error.error); });
                }
                return response.json();
            })
            .then(data => {
                alert('Location and members confirmed!');
                window.location.href = '/'; // Redirect to the home page or another page
            })
            .catch(error => {
                document.getElementById('error-message').textContent = error.message; // Display error message
                console.error('Error:', error);
            });
        } else {
            alert('Please add at least one member.');
        }
    }

    // Go back to the previous page
    function goBack() {
        window.history.back();
    }

    // Attach functions to the global scope
    window.searchUsers = searchUsers;
    window.addMember = addMember;
    window.confirmMembers = confirmMembers;
    window.goBack = goBack;
});
