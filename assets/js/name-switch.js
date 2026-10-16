// Name comparison for the family: two tags, top right, switch every mention of
// the orchards between its current name and the proposed one, on every page.
// The choice is remembered while clicking between the sites.
// Lives on the claude/dreamy-johnson-h5xvv2 branch only. Do not merge to main.
(function () {
  var NAMES = ["Witherslack Orchards", "Halecat Orchards"];
  var KEY = "estate-orchards-name";
  var shown = NAMES[0]; // the name as written in the pages

  var bar = document.createElement("div");
  bar.className = "preview-banner";
  var label = document.createElement("span");
  label.textContent = "Name preview, not the live website. Compare the names:";
  bar.appendChild(label);
  var group = document.createElement("div");
  group.className = "preview-tags";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Orchards name");
  NAMES.forEach(function (name) {
    var tag = document.createElement("button");
    tag.type = "button";
    tag.textContent = name;
    tag.dataset.name = name;
    tag.addEventListener("click", function () {
      swap(name);
      try { localStorage.setItem(KEY, name); } catch (e) {}
    });
    group.appendChild(tag);
  });
  bar.appendChild(group);
  document.body.insertBefore(bar, document.body.firstChild);

  function swap(to) {
    if (to !== shown) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentNode.closest(".preview-tags, script, style")) continue;
        if (node.nodeValue.indexOf(shown) !== -1) node.nodeValue = node.nodeValue.split(shown).join(to);
      }
      document.title = document.title.split(shown).join(to);
      shown = to;
    }
    var tags = group.querySelectorAll("button");
    for (var i = 0; i < tags.length; i++) tags[i].setAttribute("aria-pressed", String(tags[i].dataset.name === to));
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  swap(NAMES.indexOf(saved) !== -1 ? saved : NAMES[0]);
})();
