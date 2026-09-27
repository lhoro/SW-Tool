const setReportsHidden = (hidden) => {
  const report = $("#fight_view");
  report.toggleClass("hidden", Boolean(hidden));
};
