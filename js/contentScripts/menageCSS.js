const hideReports = () =>{
    let report = $("#fight_view")
    if(storageGetItem("config").hideReports){ 
        report.addClass("hidden");
    }
    else{
        report.removeClass("hidden");
    }
}