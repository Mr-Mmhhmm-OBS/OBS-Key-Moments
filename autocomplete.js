function autocomplete($inp) {
    /*the autocomplete function takes two arguments,
    the text field element and an array of possible autocompleted values:*/
    var currentFocus;
    $inp.on("click", function (e) {
        if (e.currentTarget.getAttribute("contentEditable") === "true") {
            populate(e.currentTarget);
        }
    }).on("input", function (e) {
        populate(e.currentTarget);
    }).on("keydown", function (e) {
        /*execute a function presses a key on the keyboard:*/
        var x = document.getElementById(this.id + "autocomplete-list");
        if (x) {
            x = x.getElementsByTagName("div");
            if (x.length) {
                switch (e.keyCode) {
                    case 9:
                    /*If the TAB key is pressed, prevent the form from being submitted,*/
                    case 13:
                        /*If the ENTER key is pressed, prevent the form from being submitted,*/
                        if (currentFocus > -1) {
                            /*and simulate a click on the "active" item:*/
                            e.preventDefault();
                            x[currentFocus].click();
                            e.stopPropagation();
                        }
                        break;
                    case 38:
                        /*If the arrow UP key is pressed, decrease the currentFocus variable:*/
                        currentFocus--;
                        /*and and make the current item more visible:*/
                        addActive(x);
                        break;
                    case 40:
                        /*If the arrow DOWN key is pressed, increase the currentFocus variable:*/
                        currentFocus++;
                        /*and and make the current item more visible:*/
                        addActive(x);
                        break;
                    default:
                }
            }
        }
    }).on("blur", function (e) {
        setTimeout(() => closeAllLists(e.currentTarget), 100);
    });

    function populate(target) {
        /*execute a function when someone writes in the text field:*/
        var a, b, i, val = target.innerText;
        /*close any already open lists of autocompleted values*/
        closeAllLists();
        if (!val) { return false; }
        currentFocus = -1;
        /*create a DIV element that will contain the items (values):*/
        a = document.createElement("DIV");
        a.setAttribute("id", target.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        /*append the DIV element as a child of the autocomplete container:*/
        target.parentNode.appendChild(a);
        /*for each item in the array...*/
        for (var item in auto_scenes) {
            /*check if the item starts with the same letters as the text field value:*/
            if (item.substr(0, val.length).toUpperCase() == val.toUpperCase()) {
                /*create a DIV element for each matching element:*/
                $(a).append(
                    $("<div/>").append(
                        /*make the matching letters bold:*/
                        $("<strong>").text(item.substr(0, val.length)),
                        item.substr(val.length),
                        /*insert a input field that will hold the current array item's value:*/
                        $("<input/>", { type: "hidden", value: item })
                    ).on("click", function (e) {
                        /*execute a function when someone clicks on the item value (DIV element):*/
                        /*insert the value for the autocomplete text field:*/
                        var value = $(e.currentTarget).find("input").val();
                        $inp.text(value);

                        // Set carot to end of text
                        var range = document.createRange();
                        range.setStart($inp[0].childNodes[0], value.length);
                        range.collapse(true);
                        var sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);

                        /*close the list of autocompleted values,
                        (or any other open lists of autocompleted values:*/
                        closeAllLists();
                    })
                );
            }
        }
        if (a.children.length > 0) {
            currentFocus = 0;
            addActive(a.getElementsByTagName("div"));
        }
    }

    function addActive(x) {
        /*a function to classify an item as "active":*/
        if (!x) return false;
        /*start by removing the "active" class on all items:*/
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        /*add class "autocomplete-active":*/
        x[currentFocus].classList.add("autocomplete-active");
    }
    function removeActive(x) {
        /*a function to remove the "active" class from all autocomplete items:*/
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }
    function closeAllLists(target) {
        if (target) {
            $(target.parentElement).find("#autocomplete-list").remove();
        } else {
            $("#autocomplete-list").remove();
        }
    }
}